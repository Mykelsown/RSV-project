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
)

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

		// Generate crude intake (2-4 tankers per day, 280k-420k barrels total)
		numTankers := rand.Intn(3) + 2
		totalBarrels := 0.0
		for t := 0; t < numTankers; t++ {
			barrels := float64(rand.Intn(60000) + 80000)
			totalBarrels += barrels

			ci := models.CrudeIntake{
				ID:                  uuid.New(),
				RecordedAt:          startOfDay.Add(time.Duration(rand.Intn(12)) * time.Hour),
				TankerID:            tankerNames[rand.Intn(len(tankerNames))],
				CrudeType:           crudeTypes[rand.Intn(len(crudeTypes))],
				VolumeBarrels:       barrels,
				SourceCountry:       sourceCountries[rand.Intn(len(sourceCountries))],
				AllocationReference: fmt.Sprintf("ALLOC-%s-%d", date.Format("20060102"), t+1),
				RecordedBy:          "Operations Team",
			}
			if err := repo.InsertCrudeIntake(ctx, ci); err != nil {
				return fmt.Errorf("insert crude intake: %w", err)
			}
		}

		// Generate production unit readings (3 units per day)
		units := []string{"CDU-1", "CDU-2", "CDU-3"}
		var actualOutput float64
		for _, unit := range units {
			crudProcessed := totalBarrels / 3.0
			yieldPct := 68.0 + rand.Float64()*8.0 // 68-76%
			outputLitres := crudProcessed * 158.987 * (yieldPct / 100.0)
			actualOutput += outputLitres

			pur := models.ProductionUnitReading{
				ID:                    uuid.New(),
				RecordedAt:            startOfDay.Add(time.Duration(6+rand.Intn(8)) * time.Hour),
				UnitName:              unit,
				CrudeProcessedBarrels: crudProcessed,
				ProductOutputLitres:   outputLitres,
				YieldPercentage:       yieldPct,
				Status:                "RUNNING",
			}
			if err := repo.InsertProductionUnitReading(ctx, pur); err != nil {
				return fmt.Errorf("insert production reading: %w", err)
			}
		}

		// Generate truck loading events (45-120 per day)
		numTrucks := rand.Intn(76) + 45
		for i := 0; i < numTrucks; i++ {
			dist := nigerianDistributors[rand.Intn(len(nigerianDistributors))]
			product := productTypes[rand.Intn(len(productTypes))]
			var volume float64
			switch product {
			case "Petrol":
				volume = float64(rand.Intn(30000) + 33000) // 33k-63k litres
			case "Diesel":
				volume = float64(rand.Intn(20000) + 25000)
			case "Kerosene":
				volume = float64(rand.Intn(10000) + 15000)
			}

			tle := models.TruckLoadingEvent{
				ID:                uuid.New(),
				LoadedAt:          startOfDay.Add(time.Duration(rand.Intn(16) + 6) * time.Hour),
				TruckID:           fmt.Sprintf("TRK-%d%03d", date.Month(), i+1),
				DriverID:          fmt.Sprintf("DRV-%d%04d", date.Year()%100, rand.Intn(9999)+1),
				DistributorID:     dist.ID,
				DistributorName:   dist.Name,
				ProductType:       product,
				VolumeLitres:      volume,
				DestinationRegion: nigerianRegions[rand.Intn(len(nigerianRegions))],
				GantryID:          fmt.Sprintf("GAN-%d", rand.Intn(4)+1),
			}
			if err := repo.InsertTruckLoadingEvent(ctx, tle); err != nil {
				return fmt.Errorf("insert truck loading: %w", err)
			}
		}

		fmt.Printf("Seeded %d tankers, 3 units, %d trucks for %s\n", numTankers, numTrucks, date.Format("2006-01-02"))
	}

	// Run reconciliation for each seeded day
	fmt.Println("Running reconciliation for seeded days...")
	for daysAgo := 7; daysAgo >= 1; daysAgo-- {
		date := now.AddDate(0, 0, -daysAgo)
		startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
		_, err := engine.RunReconciliation(ctx, startOfDay)
		if err != nil {
			return fmt.Errorf("reconciliation for %s: %w", date.Format("2006-01-02"), err)
		}
		fmt.Printf("Reconciliation complete for %s\n", date.Format("2006-01-02"))
	}

	fmt.Println("Seeding complete!")
	return nil
}
