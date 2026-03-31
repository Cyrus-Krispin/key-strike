package main

import (
	"log"
	"net/http"
	"strings"

	"github.com/clerk/clerk-sdk-go/v2"

	"key-strike/backend/internal/api"
	"key-strike/backend/internal/config"
	"key-strike/backend/internal/handlers"
)

func main() {
	cfg := config.Load()
	if strings.TrimSpace(cfg.ClerkSecretKey) == "" {
		log.Fatal("missing CLERK_SECRET_KEY")
	}
	clerk.SetKey(cfg.ClerkSecretKey)

	h := handlers.New(cfg)
	router := api.NewRouter(h, cfg)

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: api.WithCORS(router, cfg.AllowedOrigin),
	}

	log.Printf("backend listening on http://localhost:%s\n", cfg.Port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
