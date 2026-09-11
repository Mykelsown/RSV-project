package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"rsv-server/auth"
	"rsv-server/engine"
	"rsv-server/models"
	"rsv-server/repo"
	"rsv-server/seeder"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	sseClients = make(map[chan string]struct{})
	sseMu      sync.Mutex
)

func RegisterRoutes(r chi.Router) {
	r.Use(corsMiddleware)

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/login", handleLogin)
		r.Post("/auth/logout", handleLogout)
		r.With(auth.RequireAuth).Get("/auth/me", handleGetCurrentUser)

		r.With(auth.RequireAuth, auth.RequireRole("operations_manager")).Post("/seed", handleSeed)
		r.With(auth.RequireAuth, auth.RequireRole("operations_manager")).Post("/reconcile/run", handleReconcileRun)
		r.With(auth.RequireAuth, auth.RequireRole("operations_manager", "trading_desk")).Post("/crude-intake", handleCrudeIntake)
		r.With(auth.RequireAuth, auth.RequireRole("operations_manager")).Post("/production-readings", handleProductionReading)
		r.With(auth.RequireAuth, auth.RequireRole("operations_manager")).Post("/truck-loading", handleTruckLoading)

		r.With(auth.RequireAuth).Get("/dashboard/today", handleDashboardToday)
		r.With(auth.RequireAuth).Get("/reconciliations", handleGetReconciliations)
		r.With(auth.RequireAuth).Get("/reconciliations/{date}", handleGetReconciliationByDate)
		r.With(auth.RequireAuth, auth.RequireRole("operations_manager", "executive")).Patch("/reconciliations/{date}/notes", handleUpdateReconciliationNotes)
		r.With(auth.RequireAuth).Get("/ledger", handleGetLedger)
		r.With(auth.RequireAuth).Get("/alerts", handleGetAlerts)
		r.With(auth.RequireAuth, auth.RequireRole("operations_manager", "executive")).Patch("/alerts/{id}/acknowledge", handleAcknowledgeAlert)
		r.With(auth.RequireAuth).Get("/analytics/summary", handleAnalyticsSummary)
		r.With(auth.RequireAuth).Get("/analytics/trend", handleAnalyticsTrend)
		r.With(auth.RequireAuth).Get("/analytics/products", handleAnalyticsProducts)
		r.With(auth.RequireAuth).Get("/analytics/crude-sources", handleAnalyticsCrudeSources)
		r.With(auth.RequireAuth).Get("/analytics/distributors", handleAnalyticsDistributors)
		r.With(auth.RequireAuth).Get("/analytics/alerts-summary", handleAnalyticsAlertsSummary)
		r.With(auth.RequireAuth, auth.RequireRole("operations_manager", "executive")).Post("/reports/generate", handleGenerateReport)
		r.With(auth.RequireAuth).Get("/events", handleSSE)
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

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

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := repo.GetUserByEmail(r.Context(), payload.Email)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(payload.Password)); err != nil {
		respondError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := auth.GenerateToken(user.ID, user.Email, user.Role)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}
	if err := repo.UpdateUserLastLogin(r.Context(), user.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update login time")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":        user.ID,
			"email":     user.Email,
			"full_name": user.FullName,
			"role":      user.Role,
		},
	})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

func handleGetCurrentUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("auth_claims").(*auth.Claims)
	if !ok || claims == nil {
		respondError(w, http.StatusUnauthorized, "user not authenticated")
		return
	}

	user, err := repo.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"id":        user.ID,
		"email":     user.Email,
		"full_name": user.FullName,
		"role":      user.Role,
		"created_at": user.CreatedAt,
		"last_login_at": user.LastLoginAt,
	})
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

func handleUpdateReconciliationNotes(w http.ResponseWriter, r *http.Request) {
	dateStr := chi.URLParam(r, "date")
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid date format, use YYYY-MM-DD")
		return
	}

	var payload struct {
		Notes string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	rec, err := repo.UpdateReconciliationNotes(r.Context(), date, payload.Notes)
	if err != nil {
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			respondError(w, http.StatusNotFound, "reconciliation not found for this date")
			return
		}
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

func handleAnalyticsSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := repo.GetAnalyticsSummary(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, summary)
}

func handleAnalyticsTrend(w http.ResponseWriter, r *http.Request) {
	value := r.URL.Query().Get("days")
	days := 30
	if value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed <= 0 {
			respondError(w, http.StatusBadRequest, "days must be a positive integer")
			return
		}
		days = parsed
	}
	if days > 90 {
		days = 90
	}

	trend, err := repo.GetAnalyticsTrend(r.Context(), days)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, trend)
}

func handleAnalyticsProducts(w http.ResponseWriter, r *http.Request) {
	products, err := repo.GetProductBreakdown(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, products)
}

func handleAnalyticsCrudeSources(w http.ResponseWriter, r *http.Request) {
	crudeSources, err := repo.GetCrudeSourceBreakdown(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, crudeSources)
}

func handleAnalyticsDistributors(w http.ResponseWriter, r *http.Request) {
	limit := 10
	value := r.URL.Query().Get("limit")
	if value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed <= 0 {
			respondError(w, http.StatusBadRequest, "limit must be a positive integer")
			return
		}
		limit = parsed
	}
	if limit > 50 {
		limit = 50
	}

	distributors, err := repo.GetDistributorSummary(r.Context(), limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, distributors)
}

func handleAnalyticsAlertsSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := repo.GetAlertsSummary(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, summary)
}

func handleGenerateReport(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("auth_claims").(*auth.Claims)
	if !ok || claims == nil {
		respondError(w, http.StatusUnauthorized, "user not authenticated")
		return
	}

	var payload models.ReportGenerationRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if payload.ReportType == "" {
		payload.ReportType = "custom"
	}
	if payload.Format == "" {
		payload.Format = "json"
	}
	if payload.ReportType != "weekly" && payload.ReportType != "monthly" && payload.ReportType != "custom" {
		respondError(w, http.StatusBadRequest, "report_type must be weekly, monthly, or custom")
		return
	}
	if payload.Format != "json" && payload.Format != "csv" {
		respondError(w, http.StatusBadRequest, "format must be json or csv")
		return
	}

	startDate, err := time.Parse("2006-01-02", payload.StartDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid start_date format; use YYYY-MM-DD")
		return
	}
	endDate, err := time.Parse("2006-01-02", payload.EndDate)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid end_date format; use YYYY-MM-DD")
		return
	}

	if startDate.After(endDate) {
		respondError(w, http.StatusBadRequest, "start_date must be before end_date")
		return
	}

	report, err := repo.GenerateReportData(r.Context(), startDate, endDate)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	report.Metadata = models.ReportMetadata{
		GeneratedAt: time.Now().UTC(),
		GeneratedBy: claims.Email,
		ReportType:  payload.ReportType,
		StartDate:   payload.StartDate,
		EndDate:     payload.EndDate,
	}

	if payload.Format == "json" {
		filename := fmt.Sprintf("rsv-report-%s-to-%s.json", startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(report)
		return
	}

	csvRows := [][]string{
		{"key", "value"},
		{"generated_at", report.Metadata.GeneratedAt.Format(time.RFC3339)},
		{"generated_by", report.Metadata.GeneratedBy},
		{"report_type", report.Metadata.ReportType},
		{"start_date", report.Metadata.StartDate},
		{"end_date", report.Metadata.EndDate},
		{},
		{"key", "value"},
		{"total_days", strconv.Itoa(report.PeriodSummary.TotalDays)},
		{"fulfilled_days", strconv.Itoa(report.PeriodSummary.FulfilledDays)},
		{"partial_days", strconv.Itoa(report.PeriodSummary.PartialDays)},
		{"shortfall_days", strconv.Itoa(report.PeriodSummary.ShortfallDays)},
		{"avg_fulfillment_pct", fmt.Sprintf("%.2f", report.PeriodSummary.AvgFulfillmentPct)},
		{"total_crude_intake_barrels", fmt.Sprintf("%.2f", report.PeriodSummary.TotalCrudeIntakeBarrels)},
		{"total_actual_output_litres", fmt.Sprintf("%.2f", report.PeriodSummary.TotalActualOutputLitres)},
		{"total_trucks_loaded", strconv.Itoa(report.PeriodSummary.TotalTrucksLoaded)},
		{},
		{"date", "fulfillment_percentage", "actual_output_litres", "expected_output_litres", "crude_intake_total_barrels", "trucks_loaded", "status", "notes"},
	}
	for _, rec := range report.DailyRecords {
		notes := ""
		if rec.Notes != nil {
			notes = *rec.Notes
		}
		csvRows = append(csvRows, []string{
			rec.Date.Format("2006-01-02"),
			fmt.Sprintf("%.2f", rec.FulfillmentPercentage),
			fmt.Sprintf("%.2f", rec.ActualOutputLitres),
			fmt.Sprintf("%.2f", rec.ExpectedOutputLitres),
			fmt.Sprintf("%.2f", rec.CrudeIntakeTotalBarrels),
			strconv.Itoa(rec.TrucksLoaded),
			rec.Status,
			notes,
		})
	}
	csvRows = append(csvRows, []string{}, []string{"ledger_entry_count", strconv.Itoa(report.LedgerVerification.LedgerEntryCount)}, []string{"hash_chain_valid", strconv.FormatBool(report.LedgerVerification.HashChainValid)})

	csvContent := ""
	for i, row := range csvRows {
		if len(row) == 0 {
			if i > 0 {
				csvContent += "\n"
			}
			continue
		}
		for j, cell := range row {
			if j > 0 {
				csvContent += ","
			}
			csvContent += fmt.Sprintf("\"%s\"", strings.ReplaceAll(cell, "\"", "\"\""))
		}
		csvContent += "\n"
	}

	filename := fmt.Sprintf("rsv-report-%s-to-%s.csv", startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Type", "text/csv")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(csvContent))
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
	tokenString := r.URL.Query().Get("token")
	if tokenString == "" {
		tokenString = strings.TrimSpace(r.Header.Get("Authorization"))
		if strings.HasPrefix(tokenString, "Bearer ") {
			tokenString = strings.TrimSpace(strings.TrimPrefix(tokenString, "Bearer "))
		}
	}
	if tokenString == "" {
		http.Error(w, "missing or invalid token", http.StatusUnauthorized)
		return
	}
	if _, err := auth.ValidateToken(tokenString); err != nil {
		http.Error(w, "invalid or expired token", http.StatusUnauthorized)
		return
	}

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
