package main

import (
	"log"
	"net/http"

	"key-strike/backend/internal/api"
	"key-strike/backend/internal/config"
	"key-strike/backend/internal/handlers"
)

func main() {
	cfg := config.Load()
	h := handlers.New()
	router := api.NewRouter(h)

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: api.WithCORS(router, cfg.AllowedOrigin),
	}

	log.Printf("backend listening on http://localhost:%s\n", cfg.Port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
