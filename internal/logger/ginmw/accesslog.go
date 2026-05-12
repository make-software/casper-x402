package ginmw

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"

	"casper_x402_facilitator/internal/logger"
)

// AccessLog emits exactly one log entry per completed HTTP request with
// type: "access". It must be registered AFTER RequestID() so the
// request-scoped logger is available. Emission runs in a defer so a
// downstream panic still produces an access log entry after Recovery
// rewrites the response status.
func AccessLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		defer func() {
			durationMs := time.Since(start).Milliseconds()
			status := c.Writer.Status()
			bytesOut := c.Writer.Size()
			if bytesOut < 0 {
				bytesOut = 0
			}

			l := logger.Ctx(c.Request.Context()).With(
				logger.FieldType, logger.TypeAccess,
				logger.FieldStatus, status,
				logger.FieldDurationMs, durationMs,
				logger.FieldBytesOut, bytesOut,
				logger.FieldUserAgent, c.Request.UserAgent(),
			)

			msg := fmt.Sprintf("%s %s", c.Request.Method, c.Request.URL.String())
			switch {
			case status >= 500:
				l.Error(msg)
			case status >= 400:
				l.Warn(msg)
			default:
				l.Info(msg)
			}
		}()
		c.Next()
	}
}
