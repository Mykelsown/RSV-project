package seeder

import (
	"context"
	"fmt"
	"time"

	"rsv-server/models"
	"rsv-server/repo"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func SeedUsers(ctx context.Context) error {
	users := []struct {
		Email    string
		Password string
		FullName string
		Role     string
	}{
		{Email: "ops@dangote-rsv.com", Password: "Ops2026!", FullName: "Emeka Okafor", Role: "operations_manager"},
		{Email: "cfo@dangote-rsv.com", Password: "Exec2026!", FullName: "Fatima Dangote", Role: "executive"},
		{Email: "nmdpra@rsv-regulator.ng", Password: "Regulator2026!", FullName: "NMDPRA Auditor", Role: "regulatory"},
		{Email: "trading@dangote-rsv.com", Password: "Trading2026!", FullName: "Chidi Nwosu", Role: "trading_desk"},
	}

	for _, u := range users {
		if _, err := repo.GetUserByEmail(ctx, u.Email); err == nil {
			continue
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash password for %s: %w", u.Email, err)
		}

		user := models.User{
			ID:           uuid.New(),
			Email:        u.Email,
			PasswordHash: string(hash),
			FullName:     u.FullName,
			Role:         u.Role,
			CreatedAt:    time.Now().UTC(),
		}
		if err := repo.InsertUser(ctx, user); err != nil {
			return fmt.Errorf("insert user %s: %w", u.Email, err)
		}
	}

	return nil
}
