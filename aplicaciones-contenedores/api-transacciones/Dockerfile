# Etapa: Builer
FROM golang:1.22 AS builder

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .

# Sin libreria dinámica en C
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server .

# Etapa: runtime
FROM alpine:3.19

WORKDIR /app

RUN apk --no-cache add ca-certificates
RUN adduser -D -H -u 1000 appuser

COPY --from=builder /app/server .

EXPOSE 8080

USER appuser

CMD ["./server"]