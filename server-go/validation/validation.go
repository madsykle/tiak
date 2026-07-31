package validation

import (
	"fmt"
	"net"
	"regexp"
	"strings"
)

var (
	safePathRegex = regexp.MustCompile(`^[a-zA-Z0-9\-_./]+$`)
	urlRegex      = regexp.MustCompile(`^https?://(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}(?:/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=]*)?$`)
	categoryRegex = regexp.MustCompile(`^[a-zA-Z0-9 \-_]+$`)
	whitespaceRe  = regexp.MustCompile(`\s+`)
)

type ValidationError struct{ Msg string }

func (e *ValidationError) Error() string { return e.Msg }

func ValidateFilePath(path string) error {
	if path == "" {
		return &ValidationError{"Input cannot be empty"}
	}
	if len(path) > 1024 {
		return &ValidationError{fmt.Sprintf("Input too long: %d (max 1024)", len(path))}
	}
	if strings.Contains(path, "..") || strings.Contains(path, "//") || strings.HasPrefix(path, "/") {
		return &ValidationError{"Path traversal attempt detected"}
	}
	if !safePathRegex.MatchString(path) {
		return &ValidationError{"Invalid characters in path"}
	}
	return nil
}

func ValidateURL(rawURL string) error {
	if rawURL == "" {
		return &ValidationError{"Input cannot be empty"}
	}
	if len(rawURL) > 2048 {
		return &ValidationError{fmt.Sprintf("Input too long: %d (max 2048)", len(rawURL))}
	}
	if !urlRegex.MatchString(rawURL) {
		return &ValidationError{"Invalid URL format"}
	}
	return nil
}

func ValidateCategoryName(name string) error {
	if name == "" {
		return &ValidationError{"Input cannot be empty"}
	}
	if len(name) > 100 {
		return &ValidationError{fmt.Sprintf("Input too long: %d (max 100)", len(name))}
	}
	if !categoryRegex.MatchString(name) {
		return &ValidationError{"Invalid characters in category name"}
	}
	return nil
}

func SanitizeFilename(filename string) string {
	bad := []byte{'<', '>', ':', '"', '/', '\\', '|', '?', '*'}
	out := make([]byte, 0, len(filename))
	for i := 0; i < len(filename); i++ {
		c := filename[i]
		replaced := false
		for _, b := range bad {
			if c == b {
				out = append(out, '_')
				replaced = true
				break
			}
		}
		if !replaced {
			out = append(out, c)
		}
	}
	return strings.TrimSpace(string(out))
}

func SanitizeUserInput(input string) string {
	var b strings.Builder
	for _, r := range input {
		if r > 31 && r < 127 {
			b.WriteRune(r)
		}
		if b.Len() >= 5000 {
			break
		}
	}
	return b.String()
}

func ValidateURLSSRF(rawURL string) error {
	if err := ValidateURL(rawURL); err != nil {
		return err
	}
	// Parse host
	u, err := net.LookupHost(extractHost(rawURL))
	if err != nil {
		// Try direct parse
		host := extractHost(rawURL)
		if host == "" {
			return &ValidationError{"Invalid URL"}
		}
		return nil // If DNS fails, let yt-dlp handle it
	}
	for _, addr := range u {
		ip := net.ParseIP(addr)
		if ip != nil && IsPrivateIP(ip) {
			return &ValidationError{"SSRF blocked: private IP"}
		}
	}
	return nil
}

func extractHost(rawURL string) string {
	s := rawURL
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	if i := strings.IndexAny(s, "/:?"); i != -1 {
		return s[:i]
	}
	return s
}

func IsPrivateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	if v4 := ip.To4(); v4 != nil {
		return v4[0] == 10 || (v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31) ||
			(v4[0] == 192 && v4[1] == 168)
	}
	// IPv6: fc00::/7, fe80::/10
	b := ip.To16()
	if b != nil {
		if (b[0]&0xfe) == 0xfc || (b[0]&0xff) == 0xfe || (b[0]&0xff) == 0xff {
			return true
		}
	}
	return false
}

func ClassifyError(errMsg string) string {
	lower := strings.ToLower(errMsg)
	permanent := []string{"video not available", "video not found", "private video",
		"content not available", "content has been removed", "login required",
		"sign in to confirm", "not found", "unable to extract", "unsupported url",
		"no video formats found", "http error 403", "http error 404", "forbidden"}
	for _, p := range permanent {
		if strings.Contains(lower, p) {
			return "permanent"
		}
	}
	return "transient"
}

func IsSafeYtdlpArg(arg string) bool {
	lower := strings.ToLower(arg)
	blocked := []string{"--exec", "--downloader", "--external-downloader", "--cookies",
		"--config", "--batch-file", "--load-info", "--use-postprocessor", "--print", "--alias", "-e"}
	for _, b := range blocked {
		if strings.HasPrefix(lower, b) {
			return false
		}
	}
	badChars := []rune{';', '&', '|', '$', '`', '\n', '\r'}
	for _, c := range arg {
		for _, bc := range badChars {
			if c == bc {
				return false
			}
		}
	}
	return true
}
