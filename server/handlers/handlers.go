package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"rsv-server/engine"
	"rsv-server/models"
	"rsv-server/repo"
	"rsv-server/seeder"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

var (
	sseClients = make(map[chan string]struct{})
	sseMu      sync.Mutex
)

func RegisterRoutes(r chi.Router) {
	r.Use(corsMiddleware)

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/seed", handleSeed)
		r.Post("/reconcile/run", handleReconcileRun)

		r.Post("/crude-intake", handleCrudeIntake)
		r.Post("/production-readings", handleProductionReading)
		r.Post("/truck-loading", handleTruckLoading)

		r.Get("/dashboard/today", handleDashboardToday)
		r.Get("/reconciliations", handleGetReconciliations)
		r.Get("/reconciliations/{date}", handleGetReconciliationByDate)
		r.Get("/ledger", handleGetLedger)
		r.Get("/alerts", handleGetAlerts)
		r.Patch("/alerts/{id}/acknowledge", handleAcknowledgeAlert)
		r.Get("/events", handleSSE)
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

// Seed endpoint
func handleSeed(w http.ResponseWriter, r *http.Request) {
	if err := seeder.SeedData(r.Context()); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "seeded"})
}

// Reconcile Run endpoint
func handleReconcileRun(w http.ResponseWriter, r *http.Request) {
	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	rec, err := engine.RunReconciliation(r.Context(), startOfDay)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, rec)
}

// Crude Intake
func handleCrudeIntake(w http.ResponseWriter, r *http.Request) {
	var ci models.CrudeIntake
	if err := json.NewDecoder(r.Body).Decode(&ci); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if ci.ID == uuid.Nil {
		ci.ID = uuid.New()
	}
	if ci.RecordedAt.IsZero() {
		ci.RecordedAt = time.Now().UTC()
	}
	if err := repo.InsertCrudeIntake(r.Context(), ci); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, ci)
}

// Production Reading
func handleProductionReading(w http.ResponseWriter, r *http.Request) {
	var pur models.ProductionUnitReading
	if err := json.NewDecoder(r.Body).Decode(&pur); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if pur.ID == uuid.Nil {
		pur.ID = uuid.New()
	}
	if pur.RecordedAt.IsZero() {
		pur.RecordedAt = time.Now().UTC()
	}
	if err := repo.InsertProductionUnitReading(r.Context(), pur); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, pur)
}

// Truck Loading
func handleTruckLoading(w http.ResponseWriter, r *http.Request) {
	var tle models.TruckLoadingEvent
	if err := json.NewDecoder(r.Body).Decode(&tle); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if tle.ID == uuid.Nil {
		tle.ID = uuid.New()
	}
	if tle.LoadedAt.IsZero() {
		tle.LoadedAt = time.Now().UTC()
	}
	if err := repo.InsertTruckLoadingEvent(r.Context(), tle); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, tle)
}

// Dashboard Today
func handleDashboardToday(w http.ResponseWriter, r *http.Request) {
	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	crudeTotal, _ := repo.GetTodayCrudeIntakeTotal(r.Context(), startOfDay)
	truckCount, _ := repo.GetTodayTruckLoadingCount(r.Context(), startOfDay)
	alerts, _ := repo.GetUnacknowledgedAlerts(r.Context())

	// Get actual output from readings
	readings, _ := repo.GetTodayProductionUnitReadings(r.Context(), startOfDay)
	var actualOutput float64
	for _, rd := range readings {
		actualOutput += rd.ProductOutputLitres
	}

	commitmentStr := os.Getenv("DAILY_COMMITMENT_LITRES")
	commitmentTarget, _ := strconv.ParseFloat(commitmentStr, 64)
	if commitmentTarget == 0 {
		commitmentTarget = 35000000
	}

	var fulfillment float64
	if commitmentTarget > 0 {
		fulfillment = (actualOutput / commitmentTarget) * 100
	}

	status := "SHORTFALL"
	if fulfillment >= 95 {
		status = "FULFILLED"
	} else if fulfillment >= 75 {
		status = "PARTIAL"
	}

	dash := models.DashboardToday{
		CrudeIntakeBarrels: crudeTotal,
		ActualOutputLitres: actualOutput,
		TrucksLoaded:       truckCount,
		FulfillmentPercent: fulfillment,
		Status:             status,
		Alerts:             alerts,
	}

	respondJSON(w, http.StatusOK, dash)
}

// Get Reconciliations
func handleGetReconciliations(w http.ResponseWriter, r *http.Request) {
	recs, err := repo.GetAllReconciliations(r.Context(), 30)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, recs)
}

// Get Reconciliation by Date
func handleGetReconciliationByDate(w http.ResponseWriter, r *http.Request) {
	dateStr := chi.URLParam(r, "date")
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid date format, use YYYY-MM-DD")
		return
	}

	rec, err := repo.GetDailyReconciliationByDate(r.Context(), date)
	if err != nil {
		respondError(w, http.StatusNotFound, "reconciliation not found for this date")
		return
	}
	respondJSON(w, http.StatusOK, rec)
}

// Get Ledger
func handleGetLedger(w http.ResponseWriter, r *http.Request) {
	offset := 0
	limit := 50

	if o := r.URL.Query().Get("offset"); o != "" {
		offset, _ = strconv.Atoi(o)
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		limit, _ = strconv.Atoi(l)
	}

	entries, err := repo.GetLedgerEntries(r.Context(), offset, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, entries)
}

// Get Alerts
func handleGetAlerts(w http.ResponseWriter, r *http.Request) {
	alerts, err := repo.GetUnacknowledgedAlerts(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, alerts)
}

// Acknowledge Alert
func handleAcknowledgeAlert(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid alert ID")
		return
	}

	if err := repo.AcknowledgeAlert(r.Context(), id, "Dashboard User"); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "acknowledged"})
}

// SSE Endpoint
func handleSSE(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	clientChan := make(chan string, 10)
	sseMu.Lock()
	sseClients[clientChan] = struct{}{}
	sseMu.Unlock()

	defer func() {
		sseMu.Lock()
		delete(sseClients, clientChan)
		sseMu.Unlock()
	}()

	// Send initial data
	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	crudeTotal, _ := repo.GetTodayCrudeIntakeTotal(r.Context(), startOfDay)
	truckCount, _ := repo.GetTodayTruckLoadingCount(r.Context(), startOfDay)
	alerts, _ := repo.GetUnacknowledgedAlerts(r.Context())
	readings, _ := repo.GetTodayProductionUnitReadings(r.Context(), startOfDay)
	var actualOutput float64
	for _, rd := range readings {
		actualOutput += rd.ProductOutputLitres
	}

	commitmentStr := os.Getenv("DAILY_COMMITMENT_LITRES")
	commitmentTarget, _ := strconv.ParseFloat(commitmentStr, 64)
	if commitmentTarget == 0 {
		commitmentTarget = 35000000
	}

	var fulfillment float64
	if commitmentTarget > 0 {
		fulfillment = (actualOutput / commitmentTarget) * 100
	}

	status := "SHORTFALL"
	if fulfillment >= 95 {
		status = "FULFILLED"
	} else if fulfillment >= 75 {
		status = "PARTIAL"
	}

	dash := models.DashboardToday{
		CrudeIntakeBarrels: crudeTotal,
		ActualOutputLitres: actualOutput,
		TrucksLoaded:       truckCount,
		FulfillmentPercent: fulfillment,
		Status:             status,
		Alerts:             alerts,
	}

	data, _ := json.Marshal(dash)
	fmt.Fprintf(w, "event: dashboard_update\ndata: %s\n\n", data)
	flusher.Flush()

	// Stream updates every 30 seconds
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now().UTC()
			startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

			crudeTotal, _ := repo.GetTodayCrudeIntakeTotal(ctx, startOfDay)
			truckCount, _ := repo.GetTodayTruckLoadingCount(ctx, startOfDay)
			alerts, _ := repo.GetUnacknowledgedAlerts(ctx)
			readings, _ := repo.GetTodayProductionUnitReadings(ctx, startOfDay)
			var actualOutput float64
			for _, rd := range readings {
				actualOutput += rd.ProductOutputLitres
			}

			var fulfillment float64
			if commitmentTarget > 0 {
				fulfillment = (actualOutput / commitmentTarget) * 100
			}

			status := "SHORTFALL"
			if fulfillment >= 95 {
				status = "FULFILLED"
			} else if fulfillment >= 75 {
				status = "PARTIAL"
			}

			dash := models.DashboardToday{
				CrudeIntakeBarrels: crudeTotal,
				ActualOutputLitres: actualOutput,
				TrucksLoaded:       truckCount,
				FulfillmentPercent: fulfillment,
				Status:             status,
				Alerts:             alerts,
			}

			data, _ := json.Marshal(dash)
			fmt.Fprintf(w, "event: dashboard_update\ndata: %s\n\n", data)
			flusher.Flush()
		case <-clientChan:
			io.WriteString(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}
