package api

import (
	"net/http"
	"net/url"
	"strings"

	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
)

func protectedRoute(authorizedParties []string) func(http.Handler) http.Handler {
	options := make([]clerkhttp.AuthorizationOption, 0, 1)
	parties := normalizeAuthorizedParties(authorizedParties)
	if len(parties) > 0 {
		options = append(options, clerkhttp.AuthorizedPartyMatches(parties...))
	}

	return clerkhttp.RequireHeaderAuthorization(options...)
}

func normalizeAuthorizedParties(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	parties := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if normalized, ok := normalizeAuthorizedParty(trimmed); ok {
			trimmed = normalized
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		parties = append(parties, trimmed)
	}
	return parties
}

func normalizeAuthorizedParty(value string) (string, bool) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", false
	}
	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host), true
}
