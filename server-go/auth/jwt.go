package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
)

type Claims struct {
	Sub  string `json:"sub"`
	Role string `json:"role"`
	Exp  int64  `json:"exp"`
	Iat  int64  `json:"iat"`
}

func (c Claims) GetExpirationTime() (*jwt.NumericDate, error) {
	return &jwt.NumericDate{Time: time.Unix(c.Exp, 0)}, nil
}
func (c Claims) GetIssuedAt() (*jwt.NumericDate, error) {
	return &jwt.NumericDate{Time: time.Unix(c.Iat, 0)}, nil
}
func (c Claims) GetNotBefore() (*jwt.NumericDate, error) {
	return &jwt.NumericDate{Time: time.Unix(c.Iat, 0)}, nil
}
func (c Claims) GetIssuer() (string, error)   { return "", nil }
func (c Claims) GetSubject() (string, error)   { return c.Sub, nil }
func (c Claims) GetAudience() (jwt.ClaimStrings, error) { return jwt.ClaimStrings{}, nil }

type AuthConfig struct {
	JWTSecret      string
	JWTExpiryHours int64
}

type AuthState struct {
	Config AuthConfig
}

func NewAuthState(secret string, expiryHours int64) *AuthState {
	return &AuthState{
		Config: AuthConfig{
			JWTSecret:      secret,
			JWTExpiryHours: expiryHours,
		},
	}
}

func (a *AuthState) GenerateToken(username, role string) (string, error) {
	now := time.Now()
	exp := now.Add(time.Duration(a.Config.JWTExpiryHours) * time.Hour)

	claims := Claims{
		Sub:  username,
		Role: role,
		Exp:  exp.Unix(),
		Iat:  now.Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(a.Config.JWTSecret))
}

func (a *AuthState) VerifyToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(a.Config.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// HashPassword hashes a password using argon2id with a random salt.
func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	return hex.EncodeToString(salt) + ":" + hex.EncodeToString(hash), nil
}

// VerifyPassword checks a password against a salt:hash string.
func VerifyPassword(password, stored string) bool {
	parts := splitHash(stored)
	if parts[0] == "" {
		return false
	}
	salt, err := hex.DecodeString(parts[0])
	if err != nil {
		return false
	}
	expectedHash, err := hex.DecodeString(parts[1])
	if err != nil {
		return false
	}
	hash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	if len(hash) != len(expectedHash) {
		return false
	}
	// Constant-time compare
	result := byte(0)
	for i := range hash {
		result |= hash[i] ^ expectedHash[i]
	}
	return result == 0
}

func splitHash(stored string) [2]string {
	var parts [2]string
	idx := -1
	for i, c := range stored {
		if c == ':' {
			idx = i
			break
		}
	}
	if idx < 0 {
		return [2]string{}
	}
	parts[0] = stored[:idx]
	parts[1] = stored[idx+1:]
	if parts[0] == "" || parts[1] == "" {
		return [2]string{}
	}
	return parts
}

// NewID generates a UUID v4.
func NewID() string { return uuid.New().String() }
