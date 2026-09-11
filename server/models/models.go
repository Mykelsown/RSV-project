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
