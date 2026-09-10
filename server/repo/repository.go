package repo

import (
	"context"
	"time"

	"rsv-server/db"
	"rsv-server/models"

	"github.com/google/uuid"
)

func InsertCrudeIntake(ctx context.Context, ci models.CrudeIntake) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO crude_intake (id, recorded_at, tanker_id, crude_type, volume_barrels, source_country, allocation_reference, recorded_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		ci.ID, ci.RecordedAt, ci.TankerID, ci.CrudeType, ci.VolumeBarrels, ci.SourceCountry, ci.AllocationReference, ci.RecordedBy)
	return err
}

func InsertProductionUnitReading(ctx context.Context, pur models.ProductionUnitReading) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO production_unit_readings (id, recorded_at, unit_name, crude_processed_barrels, product_output_litres, yield_percentage, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		pur.ID, pur.RecordedAt, pur.UnitName, pur.CrudeProcessedBarrels, pur.ProductOutputLitres, pur.YieldPercentage, pur.Status)
	return err
}

func InsertTruckLoadingEvent(ctx context.Context, tle models.TruckLoadingEvent) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO truck_loading_events (id, loaded_at, truck_id, driver_id, distributor_id, distributor_name, product_type, volume_litres, destination_region, gantry_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		tle.ID, tle.LoadedAt, tle.TruckID, tle.DriverID, tle.DistributorID, tle.DistributorName, tle.ProductType, tle.VolumeLitres, tle.DestinationRegion, tle.GantryID)
	return err
}

func GetTodayCrudeIntakeTotal(ctx context.Context, date time.Time) (float64, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	end := start.Add(24 * time.Hour)

	var total float64
	err := db.Pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(volume_barrels), 0) FROM crude_intake WHERE recorded_at >= $1 AND recorded_at < $2`,
		start, end).Scan(&total)
	return total, err
}

func GetTodayProductionUnitReadings(ctx context.Context, date time.Time) ([]models.ProductionUnitReading, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	end := start.Add(24 * time.Hour)

	rows, err := db.Pool.Query(ctx,
		`SELECT id, recorded_at, unit_name, crude_processed_barrels, product_output_litres, yield_percentage, status
		 FROM production_unit_readings WHERE recorded_at >= $1 AND recorded_at < $2`,
		start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var readings []models.ProductionUnitReading
	for rows.Next() {
		var r models.ProductionUnitReading
		err := rows.Scan(&r.ID, &r.RecordedAt, &r.UnitName, &r.CrudeProcessedBarrels, &r.ProductOutputLitres, &r.YieldPercentage, &r.Status)
		if err != nil {
			return nil, err
		}
		readings = append(readings, r)
	}
	return readings, nil
}

func GetTodayTruckLoadingCount(ctx context.Context, date time.Time) (int, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	end := start.Add(24 * time.Hour)

	var count int
	err := db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM truck_loading_events WHERE loaded_at >= $1 AND loaded_at < $2`,
		start, end).Scan(&count)
	return count, err
}

func GetDailyReconciliationByDate(ctx context.Context, date time.Time) (*models.DailyReconciliation, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

	var r models.DailyReconciliation
	err := db.Pool.QueryRow(ctx,
		`SELECT id, reconciliation_date, crude_intake_total_barrels, expected_output_litres, actual_output_litres, trucks_loaded, commitment_target_litres, fulfillment_percentage, status, notes, created_at
		 FROM daily_reconciliations WHERE reconciliation_date = $1`,
		start).Scan(&r.ID, &r.ReconciliationDate, &r.CrudeIntakeTotalBarrels, &r.ExpectedOutputLitres, &r.ActualOutputLitres, &r.TrucksLoaded, &r.CommitmentTargetLitres, &r.FulfillmentPercentage, &r.Status, &r.Notes, &r.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func GetAllReconciliations(ctx context.Context, limit int) ([]models.DailyReconciliation, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, reconciliation_date, crude_intake_total_barrels, expected_output_litres, actual_output_litres, trucks_loaded, commitment_target_litres, fulfillment_percentage, status, notes, created_at
		 FROM daily_reconciliations ORDER BY reconciliation_date DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recs []models.DailyReconciliation
	for rows.Next() {
		var r models.DailyReconciliation
		err := rows.Scan(&r.ID, &r.ReconciliationDate, &r.CrudeIntakeTotalBarrels, &r.ExpectedOutputLitres, &r.ActualOutputLitres, &r.TrucksLoaded, &r.CommitmentTargetLitres, &r.FulfillmentPercentage, &r.Status, &r.Notes, &r.CreatedAt)
		if err != nil {
			return nil, err
		}
		recs = append(recs, r)
	}
	return recs, nil
}

func GetLedgerEntries(ctx context.Context, offset, limit int) ([]models.LedgerEntry, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, entry_date, reconciliation_id, content_hash, previous_hash, created_at
		 FROM ledger_entries ORDER BY entry_date DESC OFFSET $1 LIMIT $2`, offset, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.LedgerEntry
	for rows.Next() {
		var e models.LedgerEntry
		err := rows.Scan(&e.ID, &e.EntryDate, &e.ReconciliationID, &e.ContentHash, &e.PreviousHash, &e.CreatedAt)
		if err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func InsertDailyReconciliation(ctx context.Context, r models.DailyReconciliation) (uuid.UUID, error) {
	var id uuid.UUID
	err := db.Pool.QueryRow(ctx,
		`INSERT INTO daily_reconciliations (id, reconciliation_date, crude_intake_total_barrels, expected_output_litres, actual_output_litres, trucks_loaded, commitment_target_litres, fulfillment_percentage, status, notes)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id`,
		r.ID, r.ReconciliationDate, r.CrudeIntakeTotalBarrels, r.ExpectedOutputLitres, r.ActualOutputLitres, r.TrucksLoaded, r.CommitmentTargetLitres, r.FulfillmentPercentage, r.Status, r.Notes).Scan(&id)
	return id, err
}

func InsertLedgerEntry(ctx context.Context, e models.LedgerEntry) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO ledger_entries (id, entry_date, reconciliation_id, content_hash, previous_hash)
		 VALUES ($1, $2, $3, $4, $5)`,
		e.ID, e.EntryDate, e.ReconciliationID, e.ContentHash, e.PreviousHash)
	return err
}

func GetPreviousLedgerEntry(ctx context.Context) (*models.LedgerEntry, error) {
	var e models.LedgerEntry
	err := db.Pool.QueryRow(ctx,
		`SELECT id, entry_date, reconciliation_id, content_hash, previous_hash, created_at
		 FROM ledger_entries ORDER BY entry_date DESC LIMIT 1`).Scan(&e.ID, &e.EntryDate, &e.ReconciliationID, &e.ContentHash, &e.PreviousHash, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func InsertAlert(ctx context.Context, a models.Alert) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO alerts (id, triggered_at, alert_type, severity, message)
		 VALUES ($1, $2, $3, $4, $5)`,
		a.ID, a.TriggeredAt, a.AlertType, a.Severity, a.Message)
	return err
}

func GetUnacknowledgedAlerts(ctx context.Context) ([]models.Alert, error) {
	rows, err := db.Pool.Query(ctx,
		`SELECT id, triggered_at, alert_type, severity, message, acknowledged_by, acknowledged_at
		 FROM alerts WHERE acknowledged_by IS NULL ORDER BY triggered_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []models.Alert
	for rows.Next() {
		var a models.Alert
		err := rows.Scan(&a.ID, &a.TriggeredAt, &a.AlertType, &a.Severity, &a.Message, &a.AcknowledgedBy, &a.AcknowledgedAt)
		if err != nil {
			return nil, err
		}
		alerts = append(alerts, a)
	}
	return alerts, nil
}

func AcknowledgeAlert(ctx context.Context, id uuid.UUID, by string) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE alerts SET acknowledged_by = $1, acknowledged_at = NOW() WHERE id = $2 AND acknowledged_by IS NULL`,
		by, id)
	return err
}

func ReconciliationExists(ctx context.Context, date time.Time) (bool, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	var exists bool
	err := db.Pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM daily_reconciliations WHERE reconciliation_date = $1)`,
		start).Scan(&exists)
	return exists, err
}
