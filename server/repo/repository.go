package repo

import (
	"context"
	"crypto/sha256"
	"fmt"
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

func UpdateReconciliationNotes(ctx context.Context, date time.Time, notes string) (*models.DailyReconciliation, error) {
	start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

	var r models.DailyReconciliation
	err := db.Pool.QueryRow(ctx,
		`UPDATE daily_reconciliations
		 SET notes = $1
		 WHERE reconciliation_date = $2
		 RETURNING id, reconciliation_date, crude_intake_total_barrels, expected_output_litres, actual_output_litres, trucks_loaded, commitment_target_litres, fulfillment_percentage, status, notes, created_at`,
		notes, start).Scan(&r.ID, &r.ReconciliationDate, &r.CrudeIntakeTotalBarrels, &r.ExpectedOutputLitres, &r.ActualOutputLitres, &r.TrucksLoaded, &r.CommitmentTargetLitres, &r.FulfillmentPercentage, &r.Status, &r.Notes, &r.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
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

func InsertUser(ctx context.Context, u models.User) error {
	_, err := db.Pool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, full_name, role, created_at, last_login_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		u.ID, u.Email, u.PasswordHash, u.FullName, u.Role, u.CreatedAt, u.LastLoginAt)
	return err
}

func GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := db.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, full_name, role, created_at, last_login_at
		 FROM users WHERE email = $1`, email).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.FullName, &u.Role, &u.CreatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var u models.User
	err := db.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, full_name, role, created_at, last_login_at
		 FROM users WHERE id = $1`, id).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.FullName, &u.Role, &u.CreatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func UpdateUserLastLogin(ctx context.Context, id uuid.UUID) error {
	_, err := db.Pool.Exec(ctx,
		`UPDATE users SET last_login_at = NOW() WHERE id = $1`, id)
	return err
}

func GetAnalyticsSummary(ctx context.Context) (*models.AnalyticsSummary, error) {
	var summary models.AnalyticsSummary
	var best models.AnalyticsBestDay
	var worst models.AnalyticsWorstDay

	err := db.Pool.QueryRow(ctx, `
		SELECT
			COUNT(*)::int,
			COALESCE(SUM(CASE WHEN status = 'FULFILLED' THEN 1 ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN status = 'PARTIAL' THEN 1 ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN status = 'SHORTFALL' THEN 1 ELSE 0 END), 0)::int,
			COALESCE(AVG(fulfillment_percentage), 0),
			COALESCE(SUM(crude_intake_total_barrels), 0),
			COALESCE(SUM(actual_output_litres), 0),
			COALESCE(SUM(trucks_loaded), 0)
		FROM daily_reconciliations
	`).Scan(
		&summary.TotalDaysRecorded,
		&summary.FulfilledDays,
		&summary.PartialDays,
		&summary.ShortfallDays,
		&summary.AverageFulfillmentPercentage,
		&summary.TotalCrudeIntakeBarrels,
		&summary.TotalActualOutputLitres,
		&summary.TotalTrucksLoaded,
	)
	if err != nil {
		return nil, err
	}

	if summary.TotalDaysRecorded > 0 {
		summary.CommitmentHitRatePercentage = (float64(summary.FulfilledDays) / float64(summary.TotalDaysRecorded)) * 100
		summary.AverageFulfillmentPercentage = roundFloat(summary.AverageFulfillmentPercentage, 2)
		summary.CommitmentHitRatePercentage = roundFloat(summary.CommitmentHitRatePercentage, 2)
	}

	if err := db.Pool.QueryRow(ctx, `
		SELECT reconciliation_date, fulfillment_percentage, actual_output_litres
		FROM daily_reconciliations
		ORDER BY fulfillment_percentage DESC, reconciliation_date DESC
		LIMIT 1
	`).Scan(&best.Date, &best.FulfillmentPercentage, &best.ActualOutputLitres); err == nil {
		summary.BestDay = best
	}

	if err := db.Pool.QueryRow(ctx, `
		SELECT reconciliation_date, fulfillment_percentage, actual_output_litres
		FROM daily_reconciliations
		ORDER BY fulfillment_percentage ASC, reconciliation_date ASC
		LIMIT 1
	`).Scan(&worst.Date, &worst.FulfillmentPercentage, &worst.ActualOutputLitres); err == nil {
		summary.WorstDay = worst
	}

	return &summary, nil
}

func GetAnalyticsTrend(ctx context.Context, days int) ([]models.AnalyticsTrendPoint, error) {
	if days <= 0 {
		days = 30
	}
	if days > 90 {
		days = 90
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT reconciliation_date, fulfillment_percentage, actual_output_litres, expected_output_litres,
			crude_intake_total_barrels, trucks_loaded, status
		FROM daily_reconciliations
		WHERE reconciliation_date >= CURRENT_DATE - $1::integer
		ORDER BY reconciliation_date ASC
	`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []models.AnalyticsTrendPoint
	for rows.Next() {
		var p models.AnalyticsTrendPoint
		if err := rows.Scan(&p.Date, &p.FulfillmentPercentage, &p.ActualOutputLitres, &p.ExpectedOutputLitres, &p.CrudeIntakeTotalBarrels, &p.TrucksLoaded, &p.Status); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, nil
}

func GetProductBreakdown(ctx context.Context) (*models.ProductBreakdownResponse, error) {
	response := &models.ProductBreakdownResponse{}

	var total float64
	for _, product := range []string{"Petrol", "Diesel", "Kerosene"} {
		var item models.ProductBreakdownItem
		item.ProductType = product
		err := db.Pool.QueryRow(ctx, `
			SELECT COALESCE(SUM(volume_litres), 0), COUNT(*), COALESCE(SUM(volume_litres), 0)
			FROM truck_loading_events
			WHERE product_type = $1
		`, product).Scan(&item.TotalVolumeLitres, &item.TotalTrucks, &item.TotalVolumeLitres)
		if err != nil {
			return nil, err
		}
		if product == "Petrol" { response.Petrol = item }
		if product == "Diesel" { response.Diesel = item }
		if product == "Kerosene" { response.Kerosene = item }
		total += item.TotalVolumeLitres
	}

	response.GrandTotalVolumeLitres = total
	response.GrandTotalTrucks = response.Petrol.TotalTrucks + response.Diesel.TotalTrucks + response.Kerosene.TotalTrucks
	if total > 0 {
		response.Petrol.PercentageOfTotal = roundFloat((response.Petrol.TotalVolumeLitres/total)*100, 2)
		response.Diesel.PercentageOfTotal = roundFloat((response.Diesel.TotalVolumeLitres/total)*100, 2)
		response.Kerosene.PercentageOfTotal = roundFloat((response.Kerosene.TotalVolumeLitres/total)*100, 2)
	}
	return response, nil
}

func GetCrudeSourceBreakdown(ctx context.Context) ([]models.CrudeSourceCountry, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT source_country, COALESCE(SUM(volume_barrels), 0), COUNT(*), COALESCE(SUM(volume_barrels), 0)
		FROM crude_intake
		GROUP BY source_country
		ORDER BY SUM(volume_barrels) DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.CrudeSourceCountry
	var grandTotal float64
	for rows.Next() {
		var s models.CrudeSourceCountry
		if err := rows.Scan(&s.SourceCountry, &s.TotalVolumeBarrels, &s.ShipmentCount, &s.TotalVolumeBarrels); err != nil {
			return nil, err
		}
		grandTotal += s.TotalVolumeBarrels
		result = append(result, s)
	}

	for i := range result {
		var crudeRows []models.CrudeTypeBreakdown
		crudeQuery, err := db.Pool.Query(ctx, `
			SELECT crude_type, COALESCE(SUM(volume_barrels), 0), COUNT(*)
			FROM crude_intake
			WHERE source_country = $1
			GROUP BY crude_type
			ORDER BY SUM(volume_barrels) DESC
		`, result[i].SourceCountry)
		if err != nil {
			return nil, err
		}
		for crudeQuery.Next() {
			var c models.CrudeTypeBreakdown
			if err := crudeQuery.Scan(&c.CrudeType, &c.VolumeBarrels, &c.ShipmentCount); err != nil {
				crudeQuery.Close()
				return nil, err
			}
			crudeRows = append(crudeRows, c)
		}
		crudeQuery.Close()
		result[i].CrudeTypes = crudeRows
		if grandTotal > 0 {
			result[i].PercentageOfTotal = roundFloat((result[i].TotalVolumeBarrels/grandTotal)*100, 2)
		}
	}
	return result, nil
}

func GetDistributorSummary(ctx context.Context, limit int) ([]models.DistributorSummary, error) {
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	rows, err := db.Pool.Query(ctx, `
		WITH distributor_totals AS (
			SELECT distributor_id, distributor_name, SUM(volume_litres) AS total_volume_litres, COUNT(*) AS total_trucks,
				ARRAY_AGG(DISTINCT destination_region) AS regions_served
			FROM truck_loading_events
			GROUP BY distributor_id, distributor_name
		),
		product_rank AS (
			SELECT distributor_id, product_type, SUM(volume_litres) AS product_volume,
				ROW_NUMBER() OVER (PARTITION BY distributor_id ORDER BY SUM(volume_litres) DESC) AS rn
			FROM truck_loading_events
			GROUP BY distributor_id, product_type
		)
		SELECT d.distributor_id, d.distributor_name, d.total_volume_litres, d.total_trucks, d.regions_served, p.product_type AS top_product
		FROM distributor_totals d
		JOIN product_rank p ON p.distributor_id = d.distributor_id AND p.rn = 1
		ORDER BY d.total_volume_litres DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summary []models.DistributorSummary
	for rows.Next() {
		var item models.DistributorSummary
		var regions []string
		if err := rows.Scan(&item.DistributorID, &item.DistributorName, &item.TotalVolumeLitres, &item.TotalTrucks, &regions, &item.TopProduct); err != nil {
			return nil, err
		}
		item.RegionsServed = regions
		summary = append(summary, item)
	}
	return summary, nil
}

func GetAlertsSummary(ctx context.Context) (*models.AlertSummary, error) {
	var summary models.AlertSummary
	if err := db.Pool.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COUNT(CASE WHEN severity = 'CRITICAL' THEN 1 END),
			COUNT(CASE WHEN severity = 'WARNING' THEN 1 END),
			COUNT(CASE WHEN severity = 'INFO' THEN 1 END),
			COUNT(CASE WHEN acknowledged_by IS NOT NULL THEN 1 END),
			COUNT(CASE WHEN acknowledged_by IS NULL THEN 1 END)
		FROM alerts
	`).Scan(&summary.TotalAlerts, &summary.CriticalAlerts, &summary.WarningAlerts, &summary.InfoAlerts, &summary.AcknowledgedAlerts, &summary.UnacknowledgedAlerts); err != nil {
		return nil, err
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT (date_trunc('week', triggered_at) + INTERVAL '1 day')::date AS week_start, COUNT(*)
		FROM alerts
		WHERE triggered_at >= CURRENT_DATE - INTERVAL '8 weeks'
		GROUP BY week_start
		ORDER BY week_start ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var week models.AlertWeek
		if err := rows.Scan(&week.WeekStart, &week.Count); err != nil {
			return nil, err
		}
		summary.AlertsByWeek = append(summary.AlertsByWeek, week)
	}
	return &summary, nil
}

func GenerateReportData(ctx context.Context, startDate, endDate time.Time) (*models.ReportData, error) {
	if startDate.After(endDate) {
		return nil, fmt.Errorf("start date must be before end date")
	}

	var summary models.ReportPeriodSummary
	err := db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)::int,
			COALESCE(SUM(CASE WHEN status = 'FULFILLED' THEN 1 ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN status = 'PARTIAL' THEN 1 ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN status = 'SHORTFALL' THEN 1 ELSE 0 END), 0)::int,
			COALESCE(AVG(fulfillment_percentage), 0),
			COALESCE(SUM(crude_intake_total_barrels), 0),
			COALESCE(SUM(actual_output_litres), 0),
			COALESCE(SUM(trucks_loaded), 0)::int
		FROM daily_reconciliations
		WHERE reconciliation_date BETWEEN $1 AND $2
	`, startDate, endDate).Scan(
		&summary.TotalDays,
		&summary.FulfilledDays,
		&summary.PartialDays,
		&summary.ShortfallDays,
		&summary.AvgFulfillmentPct,
		&summary.TotalCrudeIntakeBarrels,
		&summary.TotalActualOutputLitres,
		&summary.TotalTrucksLoaded,
	)
	if err != nil {
		return nil, err
	}

	recordRows, err := db.Pool.Query(ctx, `
		SELECT reconciliation_date, fulfillment_percentage, actual_output_litres, expected_output_litres,
			crude_intake_total_barrels, trucks_loaded, status, notes
		FROM daily_reconciliations
		WHERE reconciliation_date BETWEEN $1 AND $2
		ORDER BY reconciliation_date ASC
	`, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer recordRows.Close()

	var rowsData []models.ReportDailyRecord
	for recordRows.Next() {
		var row models.ReportDailyRecord
		var notes *string
		if err := recordRows.Scan(&row.Date, &row.FulfillmentPercentage, &row.ActualOutputLitres, &row.ExpectedOutputLitres, &row.CrudeIntakeTotalBarrels, &row.TrucksLoaded, &row.Status, &notes); err != nil {
			return nil, err
		}
		row.Notes = notes
		rowsData = append(rowsData, row)
	}

	ledgerRows, err := db.Pool.Query(ctx, `
		SELECT id, entry_date, reconciliation_id, content_hash, previous_hash, created_at
		FROM ledger_entries
		WHERE entry_date BETWEEN $1 AND $2
		ORDER BY entry_date ASC
	`, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer ledgerRows.Close()

	entries := []models.LedgerEntry{}
	for ledgerRows.Next() {
		var e models.LedgerEntry
		if err := ledgerRows.Scan(&e.ID, &e.EntryDate, &e.ReconciliationID, &e.ContentHash, &e.PreviousHash, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}

	valid := true
	for i, entry := range entries {
		if i == 0 {
			if entry.PreviousHash != "GENESIS" {
				valid = false
				break
			}
			continue
		}
		if entries[i-1].ContentHash != entry.PreviousHash {
			valid = false
			break
		}
	}

	return &models.ReportData{
		PeriodSummary: summary,
		DailyRecords: rowsData,
		LedgerVerification: models.LedgerVerification{
			LedgerEntryCount: len(entries),
			HashChainValid: valid,
		},
	}, nil
}

func roundFloat(value float64, places int) float64 {
	factor := 1.0
	for i := 0; i < places; i++ {
		factor *= 10
	}
	return float64(int(value*factor+0.5)) / factor
}

func GenerateLedgerContentHash(record models.DailyReconciliation) string {
	content := fmt.Sprintf("%s|%.2f|%.2f|%.2f|%d|%.2f|%.2f",
		record.ReconciliationDate.Format("2006-01-02"),
		record.CrudeIntakeTotalBarrels,
		record.ExpectedOutputLitres,
		record.ActualOutputLitres,
		record.TrucksLoaded,
		record.CommitmentTargetLitres,
		record.FulfillmentPercentage,
	)
	hash := sha256.Sum256([]byte(content))
	return fmt.Sprintf("%x", hash)
}
