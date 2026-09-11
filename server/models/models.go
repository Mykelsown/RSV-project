package models

import (
	"time"

	"github.com/google/uuid"
)

type CrudeIntake struct {
	ID                 uuid.UUID `json:"id"`
	RecordedAt         time.Time `json:"recorded_at"`
	TankerID           string    `json:"tanker_id"`
	CrudeType          string    `json:"crude_type"`
	VolumeBarrels      float64   `json:"volume_barrels"`
	SourceCountry      string    `json:"source_country"`
	AllocationReference string  `json:"allocation_reference"`
	RecordedBy         string    `json:"recorded_by"`
}

type ProductionUnitReading struct {
	ID                    uuid.UUID `json:"id"`
	RecordedAt            time.Time `json:"recorded_at"`
	UnitName              string    `json:"unit_name"`
	CrudeProcessedBarrels float64   `json:"crude_processed_barrels"`
	ProductOutputLitres   float64   `json:"product_output_litres"`
	YieldPercentage       float64   `json:"yield_percentage"`
	Status                string    `json:"status"`
}

type TruckLoadingEvent struct {
	ID                uuid.UUID `json:"id"`
	LoadedAt          time.Time `json:"loaded_at"`
	TruckID           string    `json:"truck_id"`
	DriverID          string    `json:"driver_id"`
	DistributorID     string    `json:"distributor_id"`
	DistributorName   string    `json:"distributor_name"`
	ProductType       string    `json:"product_type"`
	VolumeLitres      float64   `json:"volume_litres"`
	DestinationRegion string    `json:"destination_region"`
	GantryID          string    `json:"gantry_id"`
}

type DailyReconciliation struct {
	ID                        uuid.UUID `json:"id"`
	ReconciliationDate        time.Time `json:"reconciliation_date"`
	CrudeIntakeTotalBarrels   float64   `json:"crude_intake_total_barrels"`
	ExpectedOutputLitres      float64   `json:"expected_output_litres"`
	ActualOutputLitres        float64   `json:"actual_output_litres"`
	TrucksLoaded              int       `json:"trucks_loaded"`
	CommitmentTargetLitres    float64   `json:"commitment_target_litres"`
	FulfillmentPercentage     float64   `json:"fulfillment_percentage"`
	Status                    string    `json:"status"`
	Notes                     *string   `json:"notes"`
	CreatedAt                 time.Time `json:"created_at"`
}

type LedgerEntry struct {
	ID              uuid.UUID `json:"id"`
	EntryDate       time.Time `json:"entry_date"`
	ReconciliationID uuid.UUID `json:"reconciliation_id"`
	ContentHash     string    `json:"content_hash"`
	PreviousHash    string    `json:"previous_hash"`
	CreatedAt       time.Time `json:"created_at"`
}

type Alert struct {
	ID             uuid.UUID  `json:"id"`
	TriggeredAt    time.Time  `json:"triggered_at"`
	AlertType      string     `json:"alert_type"`
	Severity       string     `json:"severity"`
	Message        string     `json:"message"`
	AcknowledgedBy *string    `json:"acknowledged_by"`
	AcknowledgedAt *time.Time `json:"acknowledged_at"`
}

type User struct {
	ID           uuid.UUID  `json:"id"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	FullName     string     `json:"full_name"`
	Role         string     `json:"role"`
	CreatedAt    time.Time  `json:"created_at"`
	LastLoginAt  *time.Time `json:"last_login_at"`
}

type DashboardToday struct {
	CrudeIntakeBarrels  float64 `json:"crude_intake_barrels"`
	ActualOutputLitres  float64 `json:"actual_output_litres"`
	TrucksLoaded        int     `json:"trucks_loaded"`
	FulfillmentPercent  float64 `json:"fulfillment_percent"`
	Status              string  `json:"status"`
	Alerts              []Alert `json:"alerts"`
}

// Analytics response payloads

type AnalyticsSummary struct {
	TotalDaysRecorded            int     `json:"total_days_recorded"`
	FulfilledDays                int     `json:"fulfilled_days"`
	PartialDays                  int     `json:"partial_days"`
	ShortfallDays                int     `json:"shortfall_days"`
	AverageFulfillmentPercentage float64 `json:"average_fulfillment_percentage"`
	BestDay                      AnalyticsBestDay `json:"best_day"`
	WorstDay                     AnalyticsWorstDay `json:"worst_day"`
	TotalCrudeIntakeBarrels      float64 `json:"total_crude_intake_barrels"`
	TotalActualOutputLitres      float64 `json:"total_actual_output_litres"`
	TotalTrucksLoaded            int     `json:"total_trucks_loaded"`
	CommitmentHitRatePercentage  float64 `json:"commitment_hit_rate_percentage"`
}

type AnalyticsBestDay struct {
	Date                 time.Time `json:"date"`
	FulfillmentPercentage float64   `json:"fulfillment_percentage"`
	ActualOutputLitres   float64   `json:"actual_output_litres"`
}

type AnalyticsWorstDay struct {
	Date                 time.Time `json:"date"`
	FulfillmentPercentage float64   `json:"fulfillment_percentage"`
	ActualOutputLitres   float64   `json:"actual_output_litres"`
}

type AnalyticsTrendPoint struct {
	Date                   time.Time `json:"date"`
	FulfillmentPercentage  float64   `json:"fulfillment_percentage"`
	ActualOutputLitres     float64   `json:"actual_output_litres"`
	ExpectedOutputLitres   float64   `json:"expected_output_litres"`
	CrudeIntakeTotalBarrels float64  `json:"crude_intake_total_barrels"`
	TrucksLoaded           int       `json:"trucks_loaded"`
	Status                 string    `json:"status"`
}

type ProductBreakdownItem struct {
	ProductType           string  `json:"product_type"`
	TotalVolumeLitres     float64 `json:"total_volume_litres"`
	TotalTrucks           int     `json:"total_trucks"`
	PercentageOfTotal     float64 `json:"percentage_of_total"`
}

type ProductBreakdownResponse struct {
	Petrol                ProductBreakdownItem `json:"Petrol"`
	Diesel                ProductBreakdownItem `json:"Diesel"`
	Kerosene              ProductBreakdownItem `json:"Kerosene"`
	GrandTotalVolumeLitres float64            `json:"grand_total_volume_litres"`
	GrandTotalTrucks       int                `json:"grand_total_trucks"`
}

type CrudeTypeBreakdown struct {
	CrudeType       string  `json:"crude_type"`
	VolumeBarrels   float64 `json:"volume_barrels"`
	ShipmentCount   int     `json:"shipment_count"`
}

type CrudeSourceCountry struct {
	SourceCountry     string                `json:"source_country"`
	TotalVolumeBarrels float64             `json:"total_volume_barrels"`
	ShipmentCount      int                  `json:"shipment_count"`
	PercentageOfTotal  float64              `json:"percentage_of_total"`
	CrudeTypes         []CrudeTypeBreakdown `json:"crude_types"`
}

type DistributorSummary struct {
	DistributorID     string   `json:"distributor_id"`
	DistributorName   string   `json:"distributor_name"`
	TotalVolumeLitres float64  `json:"total_volume_litres"`
	TotalTrucks       int      `json:"total_trucks"`
	RegionsServed     []string `json:"regions_served"`
	TopProduct        string   `json:"top_product"`
}

type AlertSummary struct {
	TotalAlerts          int        `json:"total_alerts"`
	CriticalAlerts       int        `json:"critical_alerts"`
	WarningAlerts        int        `json:"warning_alerts"`
	InfoAlerts           int        `json:"info_alerts"`
	AcknowledgedAlerts   int        `json:"acknowledged_alerts"`
	UnacknowledgedAlerts int        `json:"unacknowledged_alerts"`
	AlertsByWeek         []AlertWeek `json:"alerts_by_week"`
}

type AlertWeek struct {
	WeekStart time.Time `json:"week_start"`
	Count     int       `json:"count"`
}

type ReportGenerationRequest struct {
	ReportType string `json:"report_type"`
	StartDate  string `json:"start_date"`
	EndDate    string `json:"end_date"`
	Format     string `json:"format"`
}

type ReportMetadata struct {
	GeneratedAt time.Time `json:"generated_at"`
	GeneratedBy string    `json:"generated_by"`
	ReportType  string    `json:"report_type"`
	StartDate   string    `json:"start_date"`
	EndDate     string    `json:"end_date"`
}

type ReportPeriodSummary struct {
	TotalDays                  int     `json:"total_days"`
	FulfilledDays              int     `json:"fulfilled_days"`
	PartialDays                int     `json:"partial_days"`
	ShortfallDays              int     `json:"shortfall_days"`
	AvgFulfillmentPct          float64 `json:"avg_fulfillment_pct"`
	TotalCrudeIntakeBarrels    float64 `json:"total_crude_intake_barrels"`
	TotalActualOutputLitres    float64 `json:"total_actual_output_litres"`
	TotalTrucksLoaded          int     `json:"total_trucks_loaded"`
}

type LedgerVerification struct {
	LedgerEntryCount int    `json:"ledger_entry_count"`
	HashChainValid   bool   `json:"hash_chain_valid"`
	CheckedEntries   []string `json:"checked_entries,omitempty"`
}

type ReportDailyRecord struct {
	Date                   time.Time `json:"date"`
	FulfillmentPercentage  float64   `json:"fulfillment_percentage"`
	ActualOutputLitres     float64   `json:"actual_output_litres"`
	ExpectedOutputLitres   float64   `json:"expected_output_litres"`
	CrudeIntakeTotalBarrels float64  `json:"crude_intake_total_barrels"`
	TrucksLoaded           int       `json:"trucks_loaded"`
	Status                 string    `json:"status"`
	Notes                  *string   `json:"notes"`
}

type ReportData struct {
	Metadata            ReportMetadata        `json:"metadata"`
	PeriodSummary       ReportPeriodSummary   `json:"period_summary"`
	DailyRecords        []ReportDailyRecord   `json:"daily_records"`
	LedgerVerification  LedgerVerification    `json:"ledger_verification"`
}
