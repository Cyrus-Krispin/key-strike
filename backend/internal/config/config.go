package config

import (
	"bufio"
	"os"
	"strings"
)

type Config struct {
	Port          string
	AllowedOrigin string
}

func Load() Config {
	loadLocalEnvFiles()

	return Config{
		Port:          getEnv("PORT", "8080"),
		AllowedOrigin: getEnv("ALLOWED_ORIGIN", "*"),
	}
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func loadLocalEnvFiles() {
	merged := make(map[string]string)
	paths := []string{
		".env",
		"backend/.env",
		".env.local",
		"backend/.env.local",
	}

	for _, path := range paths {
		for key, value := range parseEnvFile(path) {
			merged[key] = value
		}
	}

	for key, value := range merged {
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}

func parseEnvFile(path string) map[string]string {
	values := make(map[string]string)

	file, err := os.Open(path)
	if err != nil {
		return values
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		value = strings.Trim(value, `"'`)
		if key == "" {
			continue
		}

		values[key] = value
	}

	return values
}
