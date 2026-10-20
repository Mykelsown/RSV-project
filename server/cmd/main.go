package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"rsv-server/db"
	"rsv-server/handlers"
	"rsv-server/repo"
	"rsv-server/seeder"
	"rsv-server/simulation"

	"github.com/go-chi/chi/v5"
	"github.com/joho/godotenv"
)

// nameplateCapacityLitres is above the largest sensible daily total. Any
// unreconciled day whose summed production reading exceeds it holds the
// broken cumulative readings from the old simulation and cannot be
// reconciled, so startup repair deletes its raw rows.
const nameplateCapacityLitres = 110000000.0

// repairImpossibleData removes raw simulation rows for dates that can never
// be reconciled, then reports what it did. Dates that already carry a
// reconciliation or ledger entry are never touched.
func repairImpossibleData(ctx context.Context) {
	days, err := repo.FindImpossibleUnreconciledDays(ctx, nameplateCapacityLitres)
	if err != nil {
		log.Printf("Startup repair could not scan for impossible days: %v", err)
		return
	}
	if len(days) == 0 {
		log.Println("Startup repair: no impossible unreconciled days found")
		return
	}
	for _, day := range days {
		if err := repo.DeleteUnreconciledDayRows(ctx, day); err != nil {
			log.Printf("Startup repair: could not clear %s: %v", day.Format("2006-01-02"), err)
			continue
		}
		fmt.Printf("Startup repair: removed unreconciled rows for %s (output above nameplate capacity)\n", day.Format("2006-01-02"))
	}
}

// autoSeedOnEmpty seeds seven days of history the first time the
// reconciliation table is empty, so charts and the ledger open with data.
func autoSeedOnEmpty(ctx context.Context) {
	count, err := repo.CountDailyReconciliations(ctx)
	if err != nil {
		log.Printf("Startup auto-seed check failed: %v", err)
		return
	}
	if count > 0 {
		return
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("AUTO_SEED_ON_EMPTY")), "false") {
		log.Println("Startup auto-seed skipped: AUTO_SEED_ON_EMPTY=false")
		return
	}
	fmt.Println("Startup: no reconciliation history, seeding 7 days")
	if err := seeder.SeedData(ctx); err != nil {
		log.Printf("Startup auto-seed failed: %v", err)
	}
}

func cleanupZeroValueReconciliation() {
	today := time.Now().UTC()
	startOfDay := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
	if err := repo.DeleteZeroReconciliationForDate(context.Background(), startOfDay); err != nil {
		log.Printf("Warning: could not clean zero reconciliation: %v", err)
		return
	}
	log.Println("Removed zero-value reconciliation record for today to allow simulation data")
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found")
	}

	if err := db.Connect(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	cleanupZeroValueReconciliation()

	// Repair data left broken by the old cumulative simulation before the
	// engine reads anything, then seed history if the table is empty.
	repairImpossibleData(context.Background())
	autoSeedOnEmpty(context.Background())

	if err := seeder.SeedUsers(context.Background()); err != nil {
		log.Printf("User seeder failed: %v", err)
	}

	simEngine, err := simulation.Start(context.Background())
	if err != nil {
		log.Printf("Simulation engine failed to start: %v", err)
	} else {
		defer simEngine.Stop()
	}

	r := chi.NewRouter()
	handlers.RegisterRoutes(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("RSV Server starting on port %s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
