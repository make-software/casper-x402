# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS builder

WORKDIR /src

COPY infra/local/deployer/deployer.cs ./
COPY infra/local/deployer/Cep18X402.wasm ./

RUN dotnet publish deployer.cs -c Release -o /out --self-contained false -p:UseAppHost=false -p:PublishAot=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/runtime:10.0-alpine

WORKDIR /app

COPY --from=builder /out ./
COPY --from=builder /src/Cep18X402.wasm ./Cep18X402.wasm

ENTRYPOINT ["dotnet", "/app/deployer.dll"]
