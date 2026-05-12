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
RUN CGO_ENABLED=0 GOOS=linux go build -o /facilitator ./apps/facilitator

# Runtime stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1000 facilitator && \
    adduser -u 1000 -G facilitator -s /bin/sh -D facilitator

# Copy binary from builder
COPY --from=builder /facilitator /app/facilitator

# Run as non-root user
USER facilitator

EXPOSE 4022

ENTRYPOINT ["/app/facilitator"]