# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_WEATHER_URL=""
ENV VITE_WEATHER_URL=${VITE_WEATHER_URL}

# Install dependencies first for layer caching.
COPY examples/csprclick-x402/package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build.
COPY examples/csprclick-x402 ./
RUN npm run build

# Runtime stage
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
