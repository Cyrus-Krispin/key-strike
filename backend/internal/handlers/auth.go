package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkjwt "github.com/clerk/clerk-sdk-go/v2/jwt"
)

func authenticatedPlayerID(r *http.Request) (string, error) {
	claims, ok := clerk.SessionClaimsFromContext(r.Context())
	if !ok || claims == nil {
		return "", errors.New("missing authenticated session claims")
	}

	playerID := strings.TrimSpace(claims.Subject)
	if playerID == "" {
		return "", errors.New("missing subject claim")
	}
	return playerID, nil
}

func (h *Handler) verifyWebSocketSession(r *http.Request) (string, error) {
	rawToken := strings.TrimSpace(r.URL.Query().Get("token"))
	token := trimBearerPrefix(rawToken)
	if token == "" {
		return "", errors.New("missing session token")
	}

	verifyParams := &clerkjwt.VerifyParams{
		Token: token,
	}

	parties := normalizeAuthorizedParties(h.authorizedParties)
	if len(parties) > 0 {
		allowed := make(map[string]struct{}, len(parties))
		for _, party := range parties {
			allowed[party] = struct{}{}
		}
		verifyParams.AuthorizedPartyHandler = func(value string) bool {
			_, ok := allowed[value]
			return ok
		}
	}

	claims, err := clerkjwt.Verify(r.Context(), verifyParams)
	if err != nil {
		return "", fmt.Errorf("invalid session token: %w", err)
	}

	playerID := strings.TrimSpace(claims.Subject)
	if playerID == "" {
		return "", errors.New("session token missing subject claim")
	}
	return playerID, nil
}

func trimBearerPrefix(value string) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) < len("bearer ") {
		return trimmed
	}
	if strings.EqualFold(trimmed[:7], "bearer ") {
		return strings.TrimSpace(trimmed[7:])
	}
	return trimmed
}

func normalizeAuthorizedParties(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	parties := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if normalized, ok := normalizeOrigin(trimmed); ok {
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

func defaultPlayerName(playerID string) string {
	id := strings.TrimSpace(playerID)
	if len(id) <= 8 {
		return id
	}
	return "Player-" + id[len(id)-8:]
}
