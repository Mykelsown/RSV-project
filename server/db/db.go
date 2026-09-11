package db

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func ApplyMigrations() error {
	if Pool == nil {
		return fmt.Errorf("database pool not initialized")
	}

	content, err := os.ReadFile("db/schema.sql")
	if err != nil {
		return fmt.Errorf("read schema migration: %w", err)
	}

	if _, err := Pool.Exec(context.Background(), string(content)); err != nil {
		return fmt.Errorf("apply schema migration: %w", err)
	}
	return nil
}

func Connect() error {
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "5433"
	}
	name := os.Getenv("DB_NAME")
	if name == "" {
		name = "rsv_db"
	}
	user := os.Getenv("DB_USER")
	if user == "" {
		user = "rsv_user"
	}
	pass := os.Getenv("DB_PASSWORD")
	if pass == "" {
		pass = "rsv_pass"
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, pass, host, port, name)

	var err error
	Pool, err = pgxpool.New(context.Background(), dsn)
	if err != nil {
		return fmt.Errorf("unable to create connection pool: %w", err)
	}

	if err := Pool.Ping(context.Background()); err != nil {
		return fmt.Errorf("unable to ping database: %w", err)
	}

	if err := ApplyMigrations(); err != nil {
		return err
	}

	return nil
}

func Close() {
	if Pool != nil {
		Pool.Close()
	}
}
