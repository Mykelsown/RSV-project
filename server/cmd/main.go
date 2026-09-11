package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"rsv-server/db"
	"rsv-server/handlers"
	"rsv-server/repo"
	"rsv-server/seeder"
	"rsv-server/simulation"

	"github.com/go-chi/chi/v5"
	"github.com/joho/godotenv"
)

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
