package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"rsv-server/db"
	"rsv-server/handlers"

	"github.com/go-chi/chi/v5"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found")
	}

	// Connect to database
	if err := db.Connect(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Start daily reconciliation scheduler
	go startScheduler()

	// Setup router
	r := chi.NewRouter()
	handlers.RegisterRoutes(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("RSV Server starting on port %s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func startScheduler() {
	for {
		now := time.Now()
		// Calculate next 23:59
		target := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 0, 0, time.UTC)
		if now.After(target) {
			target = target.Add(24 * time.Hour)
		}

		timer := time.NewTimer(target.Sub(now))
		<-timer.C

		log.Println("Running daily reconciliation...")
		// Reconciliation will be triggered by the scheduler
		// For now, log that it would run
		log.Println("Daily reconciliation scheduled at 23:59 UTC")
	}
}
