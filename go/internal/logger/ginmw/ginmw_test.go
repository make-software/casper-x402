package ginmw

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"casper_x402_facilitator/internal/logger"
)

func init() { gin.SetMode(gin.TestMode) }

// newApp builds a Gin engine with RequestID + AccessLog + Recovery
// registered, using a test logger that writes into buf. Middleware order
// matches the apps: RequestID -> AccessLog -> Recovery so that a panic
// inside a handler still produces an access log entry with status 500.
func newApp(t *testing.T) (*gin.Engine, *bytes.Buffer) {
	t.Helper()
	buf := &bytes.Buffer{}
	l := logger.New(logger.Config{Level: "debug", Output: buf})
	r := gin.New()
	r.Use(RequestID(l))
	r.Use(AccessLog())
	r.Use(gin.Recovery())
	return r, buf
}

var hex16 = regexp.MustCompile(`^[0-9a-f]{16}$`)

func TestRequestIDSetsResponseHeader(t *testing.T) {
	r, _ := newApp(t)
	r.GET("/ok", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/ok", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, 200, w.Code)
	id := w.Header().Get("X-Request-Id")
	require.True(t, hex16.MatchString(id), "X-Request-Id must be 16 hex chars, got %q", id)
}

func TestRequestIDInjectsLoggerIntoContext(t *testing.T) {
	r, buf := newApp(t)
	r.GET("/hit", func(c *gin.Context) {
		logger.Ctx(c.Request.Context()).Info("handler ran")
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/hit", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// First JSON line should be the app log from the handler.
	lines := splitLines(buf.Bytes())
	require.GreaterOrEqual(t, len(lines), 1)
	var m map[string]any
	require.NoError(t, json.Unmarshal(lines[0], &m))
	require.Equal(t, "handler ran", m["msg"])
	require.Equal(t, "app", m["type"])
	require.Equal(t, w.Header().Get("X-Request-Id"), m["req_id"])
	require.Equal(t, "10.0.0.1", m["ip"])
}

// splitLines breaks a multi-line JSON byte stream into non-empty lines.
func splitLines(b []byte) [][]byte {
	var out [][]byte
	start := 0
	for i, c := range b {
		if c == '\n' {
			if i > start {
				out = append(out, b[start:i])
			}
			start = i + 1
		}
	}
	if start < len(b) {
		out = append(out, b[start:])
	}
	return out
}

func TestAccessLogEmittedOncePerRequest(t *testing.T) {
	r, buf := newApp(t)
	r.GET("/weather", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	req := httptest.NewRequest(http.MethodGet, "/weather", nil)
	req.Header.Set("User-Agent", "test-agent")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	lines := splitLines(buf.Bytes())
	accessCount := 0
	var access map[string]any
	for _, line := range lines {
		var m map[string]any
		require.NoError(t, json.Unmarshal(line, &m))
		if m["type"] == "access" {
			accessCount++
			access = m
		}
	}
	require.Equal(t, 1, accessCount)

	require.Equal(t, "GET /weather", access["msg"])
	require.Equal(t, "test-agent", access["user_agent"])
	require.Equal(t, float64(200), access["status"])
	// duration_ms must be a non-negative number.
	dur, ok := access["duration_ms"].(float64)
	require.True(t, ok)
	require.GreaterOrEqual(t, dur, float64(0))
	// bytes_out present and non-negative.
	bo, ok := access["bytes_out"].(float64)
	require.True(t, ok)
	require.GreaterOrEqual(t, bo, float64(0))
}

func TestAccessLogLevelBasedOnStatus(t *testing.T) {
	cases := []struct {
		status int
		level  string
	}{
		{200, "info"},
		{301, "info"},
		{404, "warn"},
		{500, "error"},
	}
	for _, tc := range cases {
		t.Run(tc.level, func(t *testing.T) {
			r, buf := newApp(t)
			r.GET("/x", func(c *gin.Context) { c.Status(tc.status) })
			req := httptest.NewRequest(http.MethodGet, "/x", nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			lines := splitLines(buf.Bytes())
			var m map[string]any
			for _, line := range lines {
				var candidate map[string]any
				require.NoError(t, json.Unmarshal(line, &candidate))
				if candidate["type"] == "access" {
					m = candidate
					break
				}
			}
			require.NotNil(t, m)
			require.Equal(t, tc.level, m["level"])
		})
	}
}

func TestAccessLogEmittedOnPanic(t *testing.T) {
	r, buf := newApp(t)
	r.GET("/boom", func(c *gin.Context) { panic("kaboom") })

	req := httptest.NewRequest(http.MethodGet, "/boom", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, 500, w.Code)

	lines := splitLines(buf.Bytes())
	var access map[string]any
	for _, line := range lines {
		var m map[string]any
		if json.Unmarshal(line, &m) != nil {
			continue
		}
		if m["type"] == "access" {
			access = m
			break
		}
	}
	require.NotNil(t, access, "access log entry must be emitted even when handler panics")
	require.Equal(t, float64(500), access["status"])
	require.Equal(t, "error", access["level"])
	require.Equal(t, w.Header().Get("X-Request-Id"), access["req_id"])
}

func TestAccessLogCorrelatesWithHandlerLogs(t *testing.T) {
	r, buf := newApp(t)
	r.GET("/c", func(c *gin.Context) {
		logger.Ctx(c.Request.Context()).Info("inside handler")
		c.Status(200)
	})
	req := httptest.NewRequest(http.MethodGet, "/c", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	lines := splitLines(buf.Bytes())
	require.GreaterOrEqual(t, len(lines), 2)

	var handler, access map[string]any
	for _, line := range lines {
		var m map[string]any
		require.NoError(t, json.Unmarshal(line, &m))
		if m["type"] == "app" && m["msg"] == "inside handler" {
			handler = m
		}
		if m["type"] == "access" {
			access = m
		}
	}
	require.NotNil(t, handler)
	require.NotNil(t, access)
	require.Equal(t, handler["req_id"], access["req_id"])
}
