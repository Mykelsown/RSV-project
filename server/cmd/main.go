package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"rsv-server/db"
	"rsv-server/handlers"
	"rsv-server/seeder"
	"rsv-server/simulation"

	"github.com/go-chi/chi/v5"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found")
	}

	if err := db.Connect(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

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
