# Etapa 1: build
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /app

COPY ["ApiTarjetas.csproj", "./"]
RUN dotnet restore "ApiTarjetas.csproj"

COPY . .
RUN dotnet publish "ApiTarjetas.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Etapa 2: runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

COPY --from=builder /app/publish .

RUN useradd --system --create-home appuser
USER appuser

ENV PORT=8080
EXPOSE 8080

CMD ["dotnet", "ApiTarjetas.dll"]
