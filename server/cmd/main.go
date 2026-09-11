package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"rsv-server/db"
	"rsv-server/engine"
	"rsv-server/handlers"
	"rsv-server/seeder"

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

	if err := seeder.SeedUsers(context.Background()); err != nil {
		log.Printf("User seeder failed: %v", err)
	}

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
		today := time.Date(time.Now().UTC().Year(), time.Now().UTC().Month(), time.Now().UTC().Day(), 0, 0, 0, 0, time.UTC)
		if _, err := engine.RunReconciliation(context.Background(), today); err != nil {
			log.Printf("Daily reconciliation failed: %v", err)
		}
	}
}
