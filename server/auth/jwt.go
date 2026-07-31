package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
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
func (c Claims) GetIssuer() (string, error)             { return "", nil }
func (c Claims) GetSubject() (string, error)            { return c.Sub, nil }
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

// HashPassword hashes a password using argon2id in PHC format.
func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	saltB64 := base64.RawStdEncoding.EncodeToString(salt)
	hashB64 := base64.RawStdEncoding.EncodeToString(hash)
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=1,p=4$%s$%s", saltB64, hashB64), nil
}

// VerifyPassword checks a password against a PHC-format argon2 hash.
// Parses m, t, p from the hash string itself.
func VerifyPassword(password, stored string) bool {
	if !strings.HasPrefix(stored, "$argon2id$") {
		return false
	}
	parts := strings.Split(stored, "$")
	// parts: ["", "argon2id", "v=19", "m=...,t=...,p=...", <salt>, <hash>]
	if len(parts) != 6 {
		return false
	}

	// Parse params from parts[3]: m=19456,t=2,p=1
	var m, t, p uint32
	for _, param := range strings.Split(parts[3], ",") {
		kv := strings.SplitN(param, "=", 2)
		if len(kv) != 2 { continue }
		switch kv[0] {
		case "m":
			fmt.Sscanf(kv[1], "%d", &m)
		case "t":
			fmt.Sscanf(kv[1], "%d", &t)
		case "p":
			fmt.Sscanf(kv[1], "%d", &p)
		}
	}
	if m == 0 { m = 65536 }
	if t == 0 { t = 1 }
	if p == 0 { p = 1 }

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}
	hash := argon2.IDKey([]byte(password), salt, t, m, uint8(p), uint32(len(expectedHash)))
	if len(hash) != len(expectedHash) {
		return false
	}
	result := byte(0)
	for i := range hash {
		result |= hash[i] ^ expectedHash[i]
	}
	return result == 0
}

// NewID generates a UUID v4.
func NewID() string { return uuid.New().String() }
