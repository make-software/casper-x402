package logger

// Field name constants (snake_case per spec).
const (
	FieldLevel           = "level"
	FieldTimestamp       = "ts"
	FieldMessage         = "msg"
	FieldType            = "type"
	FieldReqID           = "req_id"
	FieldIP              = "ip"
	FieldMethod          = "method"
	FieldPath            = "path"
	FieldRoute           = "route"
	FieldStatus          = "status"
	FieldDurationMs      = "duration_ms"
	FieldBytesOut        = "bytes_out"
	FieldUserAgent       = "user_agent"
	FieldError           = "error"
	FieldLoggerError     = "logger_error"
	FieldLoggerErrorArgs = "logger_error_args"
)

// Allowed values for FieldType.
const (
	TypeApp    = "app"
	TypeAccess = "access"
	TypeX402   = "x402"
)
