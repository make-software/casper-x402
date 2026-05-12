package logger

import (
	"sync"

	"go.uber.org/zap/zapcore"
)

// ResetDefaultForTest clears the Default() singleton. Tests only.
func ResetDefaultForTest() {
	defaultOnce = sync.Once{}
	defaultLogger = nil
}

// levelString returns the configured minimum level, for tests. It inspects
// the underlying zap core via Check at each level.
func (l *Logger) levelString() string {
	for _, lvl := range []struct {
		z zapcore.Level
		s string
	}{
		{zapcore.DebugLevel, "debug"},
		{zapcore.InfoLevel, "info"},
		{zapcore.WarnLevel, "warn"},
		{zapcore.ErrorLevel, "error"},
	} {
		if l.z.Check(lvl.z, "_probe") != nil {
			return lvl.s
		}
	}
	return "unknown"
}
