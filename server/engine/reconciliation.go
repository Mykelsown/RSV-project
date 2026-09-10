package engine

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"strconv"
	"time"

	"rsv-server/models"
	"rsv-server/repo"

	"github.com/google/uuid"
)

const (
	litresPerBarrel = 158.987
	yieldCoefficient = 0.72
)

func RunReconciliation(ctx context.Context, date time.Time) (*models.DailyReconciliation, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

	// Get crude intake total
	crudeTotal, err := repo.GetTodayCrudeIntakeTotal(ctx, start)
	if err != nil {
		return nil, fmt.Errorf("failed to get crude intake total: %w", err)
	}

	// Get production unit readings
	readings, err := repo.GetTodayProductionUnitReadings(ctx, start)
	if err != nil {
		return nil, fmt.Errorf("failed to get production readings: %w", err)
	}

	// Calculate actual output from readings
	var actualOutput float64
	for _, r := range readings {
		actualOutput += r.ProductOutputLitres
	}

	// Calculate expected output
	expectedOutput := crudeTotal * litresPerBarrel * yieldCoefficient

	// Get truck loading count
	truckCount, err := repo.GetTodayTruckLoadingCount(ctx, start)
	if err != nil {
		return nil, fmt.Errorf("failed to get truck loading count: %w", err)
	}

	// Get commitment target
	commitmentStr := os.Getenv("DAILY_COMMITMENT_LITRES")
	commitmentTarget, err := strconv.ParseFloat(commitmentStr, 64)
	if err != nil {
		commitmentTarget = 35000000
	}

	// Calculate fulfillment
	var fulfillment float64
	if commitmentTarget > 0 {
		fulfillment = (actualOutput / commitmentTarget) * 100
	}

	// Determine status
	status := "SHORTFALL"
	if fulfillment >= 95 {
		status = "FULFILLED"
	} else if fulfillment >= 75 {
		status = "PARTIAL"
	}

	// Create reconciliation record
	rec := models.DailyReconciliation{
		ID:                      uuid.New(),
		ReconciliationDate:      start,
		CrudeIntakeTotalBarrels: crudeTotal,
		ExpectedOutputLitres:    expectedOutput,
		ActualOutputLitres:      actualOutput,
		TrucksLoaded:            truckCount,
		CommitmentTargetLitres:  commitmentTarget,
		FulfillmentPercentage:   fulfillment,
		Status:                  status,
		CreatedAt:               time.Now().UTC(),
	}

	// Check for shortfall alert
	thresholdStr := os.Getenv("SHORTFALL_THRESHOLD_PERCENTAGE")
	threshold, err := strconv.ParseFloat(thresholdStr, 64)
	if err != nil {
		threshold = 20
	}

	if (100 - fulfillment) > threshold {
		alert := models.Alert{
			ID:          uuid.New(),
			TriggeredAt: time.Now().UTC(),
			AlertType:   "SHORTFALL",
			Severity:    "CRITICAL",
			Message:     fmt.Sprintf("Production shortfall detected for %s: %.1f%% fulfillment (%.0f litres of %.0f target)", start.Format("2006-01-02"), fulfillment, actualOutput, commitmentTarget),
		}
		if err := repo.InsertAlert(ctx, alert); err != nil {
			return nil, fmt.Errorf("failed to insert alert: %w", err)
		}
	}

	// Insert reconciliation
	recID, err := repo.InsertDailyReconciliation(ctx, rec)
	if err != nil {
		return nil, fmt.Errorf("failed to insert reconciliation: %w", err)
	}
	rec.ID = recID

	// Generate content hash
	hashContent := fmt.Sprintf("%s|%.2f|%.2f|%.2f|%d|%.2f|%.2f",
		start.Format("2006-01-02"),
		crudeTotal, expectedOutput, actualOutput,
		truckCount, commitmentTarget, fulfillment)
	hash := sha256.Sum256([]byte(hashContent))
	contentHash := fmt.Sprintf("%x", hash)

	// Get previous ledger entry
	prevEntry, err := repo.GetPreviousLedgerEntry(ctx)
	previousHash := "GENESIS"
	if err == nil && prevEntry != nil {
		previousHash = prevEntry.ContentHash
	}

	// Insert ledger entry
	ledger := models.LedgerEntry{
		ID:              uuid.New(),
		EntryDate:       start,
		ReconciliationID: recID,
		ContentHash:     contentHash,
		PreviousHash:    previousHash,
		CreatedAt:       time.Now().UTC(),
	}
	if err := repo.InsertLedgerEntry(ctx, ledger); err != nil {
		return nil, fmt.Errorf("failed to insert ledger entry: %w", err)
	}

	return &rec, nil
}
