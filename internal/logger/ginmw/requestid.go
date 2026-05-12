package ginmw

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"

	"casper_x402_facilitator/internal/logger"
)

const (
	requestIDHeader = "X-Request-Id"
	// GinContextKey is the key used to store the request ID on *gin.Context.
	GinContextKey = "req_id"
)

// NewRequestID returns a fresh 16-char hex request identifier.
func NewRequestID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "0000000000000000"
	}
	return hex.EncodeToString(b[:])
}

// RequestID generates a request ID, stores it on the Gin context and on a
// child logger attached to the request's context.Context, and echoes it on
// the response header. base is the application's default Logger.
func RequestID(base *logger.Logger) gin.HandlerFunc {
	if base == nil {
		base = logger.Default()
	}
	return func(c *gin.Context) {
		id := NewRequestID()
		c.Set(GinContextKey, id)
		c.Writer.Header().Set(requestIDHeader, id)

		reqLogger := base.With(
			logger.FieldReqID, id,
			logger.FieldIP, c.ClientIP(),
		)
		ctx := logger.WithLogger(c.Request.Context(), reqLogger)
		c.Request = c.Request.WithContext(ctx)

		c.Next()
	}
}
