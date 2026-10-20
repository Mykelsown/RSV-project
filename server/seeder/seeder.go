package seeder

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"rsv-server/engine"
	"rsv-server/models"
	"rsv-server/repo"

	"github.com/google/uuid"
)

var (
	nigerianDistributors = []struct {
		ID   string
		Name string
	}{
		{"DIST001", "MRS Oil Nigeria Plc"},
		{"DIST002", "Total Nigeria Plc"},
		{"DIST003", "Oando Plc"},
		{"DIST004", "NNPC Retail Limited"},
		{"DIST005", "Ardova Plc"},
		{"DIST006", "HIPOL"},
		{"DIST007", "NIPCO Plc"},
		{"DIST008", "MATRIX Petroleum"},
		{"DIST009", "Conoil Plc"},
		{"DIST010", "Eterna Plc"},
		{"DIST011", "Fortis Offshore"},
		{"DIST012", "Rainoil Limited"},
		{"DIST013", "Emadeb Energy"},
		{"DIST014", "Mainland Oil"},
		{"DIST015", "Belvor Energy"},
	}

	nigerianRegions = []string{
		"Lagos", "Ogun", "Oyo", "Ondo", "Edo", "Delta", "Rivers",
		"Bayelsa", "Cross River", "Akwa Ibom", "Abuja", "Kano",
		"Kaduna", "Enugu", "Anambra", "Imo", "Abia", "Borno",
		"Niger", "Kwara", "Kogi", "Plateau", "Benue",
	}

	crudeTypes = []string{"Bonny Light", "Forcados Blend", "Qua Iboe", "Brass River", "Escravos Blend"}
	sourceCountries = []string{"Nigeria", "Angola", "Equatorial Guinea", "Gabon"}

	tankerNames = []string{
		"MT NIGER DELTA", "MT LAGOS STAR", "MT BENIN QUEEN", "MT CALABAR",
		"MT PORT HARCOURT", "MT WARRI PRINCESS", "MT SAPELE", "MT ENUGU",
		"MT ONITSHA", "MT ABUJA SPIRIT", "MT KANO SUN", "MT IBADAN",
		"MT OYO", "MT KADUNA", "MT MAIDUGURI", "MT JOS",
	}

	productTypes = []string{"Petrol", "Diesel", "Kerosene"}

	truckLitresMin = 30000.0
	truckLitresMax = 45000.0
)

// SeedData creates seven days of history shaped like live simulated days:
// 300k to 450k barrels of crude, output that tracks a per-day performance
// factor of the 35 million litre commitment, and 500 to 900 trucks of
// 30,000 to 45,000 litres each. Two days are deliberately forced into
// shortfall so the trend chart shows every status. Seeding is idempotent.
func SeedData(ctx context.Context) error {
	now := time.Now().UTC()

	for daysAgo := 7; daysAgo >= 1; daysAgo-- {
		date := now.AddDate(0, 0, -daysAgo)
		startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)

		// Check if data already exists (idempotent)
		exists, err := repo.ReconciliationExists(ctx, startOfDay)
		if err != nil {
			return fmt.Errorf("check existence for %s: %w", date.Format("2006-01-02"), err)
		}
		if exists {
			fmt.Printf("Data for %s already exists, skipping\n", date.Format("2006-01-02"))
			continue
		}

		// Plan the day like the live simulation does.
		forcedShortfall := daysAgo == 5 || daysAgo == 2 // two forced shortfall days
		var factor float64
		if forcedShortfall {
			factor = 0.62 // 60 to 70 percent fulfillment, a clear shortfall
		} else if rand.Float64() < 0.25 {
			factor = 0.55 + rand.Float64()*0.20
		} else {
			factor = 0.75 + rand.Float64()*0.30
		}
		crudeBudget := 300000.0 + rand.Float64()*150000.0
		outputBudget := factor * 35000000.0
		truckBudget := rand.Intn(401) + 500 // 500 to 900 trucks

		// Crude intake: three to five tankers dividing the day budget.
		numTankers := rand.Intn(3) + 3
		perTanker := crudeBudget / float64(numTankers)
		for t := 0; t < numTankers; t++ {
			ci := models.CrudeIntake{
				ID:                  uuid.New(),
				RecordedAt:          startOfDay.Add(time.Duration(rand.Intn(20)) * time.Hour),
				TankerID:            tankerNames[rand.Intn(len(tankerNames))],
				CrudeType:           crudeTypes[rand.Intn(len(crudeTypes))],
				VolumeBarrels:       perTanker * (0.9 + rand.Float64()*0.2),
				SourceCountry:       sourceCountries[rand.Intn(len(sourceCountries))],
				AllocationReference: fmt.Sprintf("ALLOC-%s-%d", date.Format("20060102"), t+1),
				RecordedBy:          "Operations Team",
			}
			if err := repo.InsertCrudeIntake(ctx, ci); err != nil {
				return fmt.Errorf("insert crude intake: %w", err)
			}
		}

		// Production unit readings: three units, each carrying a third of
		// the day's output spread over several readings.
		units := []string{"CDU-1", "CDU-2", "CDU-3"}
		for _, unit := range units {
			unitOutput := outputBudget / 3.0
			for r := 0; r < 3; r++ {
				yieldPct := 68.0 + rand.Float64()*8.0
				laps := []float64{0.42, 0.33, 0.25}
				pur := models.ProductionUnitReading{
					ID:                    uuid.New(),
					RecordedAt:            startOfDay.Add(time.Duration((4 + r*6 + rand.Intn(3)) % 24) * time.Hour),
					UnitName:              unit,
					CrudeProcessedBarrels: (unitOutput * laps[r] / engine.LitresPerBarrel) / (yieldPct / 100.0),
					ProductOutputLitres:   unitOutput * laps[r],
					YieldPercentage:       yieldPct,
					Status:                "RUNNING",
				}
				if err := repo.InsertProductionUnitReading(ctx, pur); err != nil {
					return fmt.Errorf("insert production reading: %w", err)
				}
			}
		}

		// Truck loading events: the daily truck budget of 30,000 to 45,000
		// litre loads.
		for i := 0; i < truckBudget; i++ {
			dist := nigerianDistributors[rand.Intn(len(nigerianDistributors))]
			product := productTypes[rand.Intn(len(productTypes))]
			tle := models.TruckLoadingEvent{
				ID:                uuid.New(),
				LoadedAt:          startOfDay.Add(time.Duration(rand.Intn(22)) * time.Hour),
				TruckID:           fmt.Sprintf("TRK-%d%04d", date.Month(), i+1),
				DriverID:          fmt.Sprintf("DRV-%d%04d", date.Year()%100, rand.Intn(9999)+1),
				DistributorID:     dist.ID,
				DistributorName:   dist.Name,
				ProductType:       product,
				VolumeLitres:      truckLitresMin + rand.Float64()*(truckLitresMax-truckLitresMin),
				DestinationRegion: nigerianRegions[rand.Intn(len(nigerianRegions))],
				GantryID:          fmt.Sprintf("GAN-%d", rand.Intn(4)+1),
			}
			if err := repo.InsertTruckLoadingEvent(ctx, tle); err != nil {
				return fmt.Errorf("insert truck loading: %w", err)
			}
		}
		fmt.Printf("Seeded %d tankers, 3 units, %d trucks for %s (%.0f%% of the 35M target)\n",
			numTankers, truckBudget, date.Format("2006-01-02"), factor*100)
	}

	// Run reconciliation for each seeded day
	fmt.Println("Running reconciliation for seeded days...")
	for daysAgo := 7; daysAgo >= 1; daysAgo-- {
		date := now.AddDate(0, 0, -daysAgo)
		startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
		if _, err := engine.RunReconciliation(ctx, startOfDay); err != nil {
			return fmt.Errorf("reconciliation for %s: %w", date.Format("2006-01-02"), err)
		}
		// Reconciliations exist now, so the loop above skips this day on
		// the next call and running reconciliation again would fail the
		// unique date constraint.
		fmt.Printf("Reconciliation complete for %s\n", date.Format("2006-01-02"))
	}

	fmt.Println("Seeding complete!")
	return nil
}
