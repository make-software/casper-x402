package logger

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// decodeOne parses a single JSON log line from buf.
func decodeOne(t *testing.T, buf *bytes.Buffer) map[string]any {
	t.Helper()
	line := buf.String()
	require.NotEmpty(t, line, "no log output")
	var m map[string]any
	require.NoError(t, json.Unmarshal([]byte(line), &m))
	return m
}

func newTestLogger(t *testing.T, level string) (*Logger, *bytes.Buffer) {
	t.Helper()
	buf := &bytes.Buffer{}
	l := New(Config{Level: level, Output: buf})
	require.NotNil(t, l)
	return l, buf
}

func TestInfoEmitsRequiredFields(t *testing.T) {
	l, buf := newTestLogger(t, "info")
	l.Info("hello")
	m := decodeOne(t, buf)

	require.Equal(t, "info", m["level"])
	require.Equal(t, "hello", m["msg"])
	require.Equal(t, "app", m["type"])
	require.Nil(t, m["req_id"])
	require.Nil(t, m["ip"])
	ts, ok := m["ts"].(string)
	require.True(t, ok, "ts must be a string")
	parsed, err := time.Parse(time.RFC3339Nano, ts)
	require.NoError(t, err, "ts must parse as RFC3339Nano")
	require.Equal(t, time.UTC, parsed.Location(), "ts must be UTC (ends with Z)")
}

func TestLevelLabels(t *testing.T) {
	for _, level := range []string{"debug", "info", "warn", "error"} {
		t.Run(level, func(t *testing.T) {
			l, buf := newTestLogger(t, "debug")
			switch level {
			case "debug":
				l.Debug("m")
			case "info":
				l.Info("m")
			case "warn":
				l.Warn("m")
			case "error":
				l.Error("m")
			}
			m := decodeOne(t, buf)
			require.Equal(t, level, m["level"])
		})
	}
}

func TestInfoWithExtraKV(t *testing.T) {
	l, buf := newTestLogger(t, "info")
	l.Info("user authenticated", "user_id", "u_123", "provider", "google")
	m := decodeOne(t, buf)
	require.Equal(t, "u_123", m["user_id"])
	require.Equal(t, "google", m["provider"])
}

func TestWithOverridesBaseFields(t *testing.T) {
	l, buf := newTestLogger(t, "info")
	l2 := l.With("req_id", "r1", "ip", "1.2.3.4")
	l2.Info("hello")
	m := decodeOne(t, buf)
	require.Equal(t, "r1", m["req_id"])
	require.Equal(t, "1.2.3.4", m["ip"])
	require.Equal(t, "app", m["type"])
}

func TestWithOverridesType(t *testing.T) {
	l, buf := newTestLogger(t, "info")
	l.With("type", "x402").Info("hook")
	m := decodeOne(t, buf)
	require.Equal(t, "x402", m["type"])

	// Ensure no duplicate `type` in raw JSON (the override replaces, not appends).
	require.Equal(t, 1, bytesCount(buf.Bytes(), `"type":`))
}

func bytesCount(haystack []byte, needle string) int {
	n := 0
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if string(haystack[i:i+len(needle)]) == needle {
			n++
		}
	}
	return n
}

func TestWithDoesNotMutateParent(t *testing.T) {
	l, buf := newTestLogger(t, "info")
	_ = l.With("req_id", "child")
	l.Info("parent")
	m := decodeOne(t, buf)
	require.Nil(t, m["req_id"], "parent logger must remain untouched")
}

func TestCallSiteKVOverridesWith(t *testing.T) {
	l, buf := newTestLogger(t, "info")
	l.With("user_id", "u1").Info("m", "user_id", "u2")
	m := decodeOne(t, buf)
	require.Equal(t, "u2", m["user_id"])
}

func TestOddKVEmitsLoggerError(t *testing.T) {
	l, buf := newTestLogger(t, "info")
	l.Info("bad call", "only_key") // 1 arg, odd
	m := decodeOne(t, buf)
	require.Equal(t, "bad call", m["msg"])
	require.Contains(t, m["logger_error"], "odd number")
}

func TestNonStringKeyEmitsLoggerError(t *testing.T) {
	l, buf := newTestLogger(t, "info")
	l.Info("bad call", 42, "value")
	m := decodeOne(t, buf)
	require.Contains(t, m["logger_error"], "non-string key")
}

func TestFromContextReturnsStoredLogger(t *testing.T) {
	l, buf := newTestLogger(t, "info")
	ctx := WithLogger(context.Background(), l.With("req_id", "r1"))

	Ctx(ctx).Info("stored")
	m := decodeOne(t, buf)
	require.Equal(t, "r1", m["req_id"])
}

func TestFromContextFallsBackToDefault(t *testing.T) {
	// nil ctx and empty ctx both return Default() (non-nil).
	require.NotNil(t, FromContext(nil))
	require.NotNil(t, FromContext(context.Background()))
}

func TestDefaultSingleton(t *testing.T) {
	a := Default()
	b := Default()
	require.Same(t, a, b, "Default() must return the same instance")
}

func TestLevelFilteringBelowMinimum(t *testing.T) {
	l, buf := newTestLogger(t, "warn")
	l.Debug("d")
	l.Info("i")
	require.Empty(t, buf.String(), "debug/info must be suppressed when level=warn")

	l.Warn("w")
	require.NotEmpty(t, buf.String())
}

func TestLogLevelEnvVarIsHonoredByDefault(t *testing.T) {
	// This is a smoke check: set env, reset default, observe level.
	t.Setenv("LOG_LEVEL", "error")
	ResetDefaultForTest()
	t.Cleanup(ResetDefaultForTest)
	l := Default()
	require.Equal(t, "error", l.levelString(), "Default() must honor LOG_LEVEL env")
}
