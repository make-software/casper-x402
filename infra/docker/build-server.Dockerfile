# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Download Go module dependencies first (for layer caching)
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./examples/server

# Runtime stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1000 server && \
    adduser -u 1000 -G server -s /bin/sh -D server

# Copy binary from builder
COPY --from=builder /server /app/server

# Run as non-root user
USER server

EXPOSE 4021

ENTRYPOINT ["/app/server"]