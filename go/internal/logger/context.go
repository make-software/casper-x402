package logger

import "context"

type ctxKey struct{}

// WithLogger returns a copy of ctx carrying l.
func WithLogger(ctx context.Context, l *Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, l)
}

// FromContext returns the logger stored in ctx, or Default() if none.
func FromContext(ctx context.Context) *Logger {
	if ctx == nil {
		return Default()
	}
	if l, ok := ctx.Value(ctxKey{}).(*Logger); ok && l != nil {
		return l
	}
	return Default()
}

// Ctx is a shorthand for FromContext.
func Ctx(ctx context.Context) *Logger { return FromContext(ctx) }
