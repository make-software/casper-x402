package logger

import (
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type Config struct {
	Level  string
	Output io.Writer
}

type Logger struct {
	z    *zap.Logger
	base []fieldPair
}

type fieldPair struct {
	key string
	val any
}

func New(cfg Config) *Logger {
	if cfg.Output == nil {
		cfg.Output = os.Stdout
	}
	lvl := parseLevel(cfg.Level)

	encCfg := zapcore.EncoderConfig{
		MessageKey:     FieldMessage,
		LevelKey:       FieldLevel,
		TimeKey:        FieldTimestamp,
		NameKey:        "",
		CallerKey:      "",
		StacktraceKey:  "",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel: zapcore.LowercaseLevelEncoder,
		EncodeTime: func(t time.Time, enc zapcore.PrimitiveArrayEncoder) {
			enc.AppendString(t.UTC().Format(time.RFC3339Nano))
		},
		EncodeDuration: zapcore.StringDurationEncoder,
	}
	core := zapcore.NewCore(
		zapcore.NewJSONEncoder(encCfg),
		zapcore.AddSync(cfg.Output),
		lvl,
	)
	z := zap.New(core)

	// Seed base with required fields set to their defaults (null / "app").
	base := []fieldPair{
		{FieldType, TypeApp},
		{FieldReqID, nil},
		{FieldIP, nil},
	}
	return &Logger{z: z, base: base}
}

// parseLevel maps a string to a zapcore level. Unknown values default to info.
func parseLevel(s string) zapcore.Level {
	switch s {
	case "debug":
		return zapcore.DebugLevel
	case "warn":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

func (l *Logger) Debug(msg string, kv ...any) { l.log(zapcore.DebugLevel, msg, kv) }
func (l *Logger) Info(msg string, kv ...any)  { l.log(zapcore.InfoLevel, msg, kv) }
func (l *Logger) Warn(msg string, kv ...any)  { l.log(zapcore.WarnLevel, msg, kv) }
func (l *Logger) Error(msg string, kv ...any) { l.log(zapcore.ErrorLevel, msg, kv) }

func (l *Logger) log(lvl zapcore.Level, msg string, kv []any) {
	merged, errField := mergeKV(l.base, kv)
	fields := toZapFields(merged)
	if errField != "" {
		fields = append(fields, zap.String(FieldLoggerError, errField), zap.Any(FieldLoggerErrorArgs, kv))
	}
	if ce := l.z.Check(lvl, msg); ce != nil {
		ce.Write(fields...)
	}
}

// mergeKV appends the kv pairs onto base with override semantics:
// repeated keys replace earlier values while preserving first-seen order.
// Returns an error message (non-empty) when kv is malformed.
func mergeKV(base []fieldPair, kv []any) ([]fieldPair, string) {
	if len(kv)%2 != 0 {
		return base, fmt.Sprintf("odd number of kv args (%d)", len(kv))
	}
	out := make([]fieldPair, len(base))
	copy(out, base)
	idx := make(map[string]int, len(base))
	for i, p := range base {
		idx[p.key] = i
	}
	for i := 0; i < len(kv); i += 2 {
		key, ok := kv[i].(string)
		if !ok {
			return base, fmt.Sprintf("non-string key at position %d: %T", i, kv[i])
		}
		val := kv[i+1]
		if j, exists := idx[key]; exists {
			out[j].val = val
			continue
		}
		idx[key] = len(out)
		out = append(out, fieldPair{key, val})
	}
	return out, ""
}

func toZapFields(fs []fieldPair) []zap.Field {
	zs := make([]zap.Field, len(fs))
	for i, p := range fs {
		zs[i] = zap.Any(p.key, p.val)
	}
	return zs
}

func (l *Logger) With(kv ...any) *Logger {
	merged, errField := mergeKV(l.base, kv)
	if errField != "" {
		// On malformed With() args, return a derived logger whose base carries
		// a logger_error field, so every subsequent emission surfaces the fault.
		extra := append([]fieldPair{}, l.base...)
		extra = append(extra, fieldPair{FieldLoggerError, errField})
		return &Logger{z: l.z, base: extra}
	}
	return &Logger{z: l.z, base: merged}
}

var (
	defaultOnce   sync.Once
	defaultLogger *Logger
)

// Default returns a process-wide Logger configured from LOG_LEVEL env
// (default: info). Output is always os.Stdout.
func Default() *Logger {
	defaultOnce.Do(func() {
		defaultLogger = New(Config{
			Level:  os.Getenv("LOG_LEVEL"),
			Output: os.Stdout,
		})
	})
	return defaultLogger
}
