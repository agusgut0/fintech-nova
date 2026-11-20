# Etapa 1: Builder
FROM python:3.11-slim AS builder

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Etapa 2: runtime
FROM python:3.11-slim

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Sin WORKDIR, el COPY dejaba el codigo en la raiz del sistema de archivos (Hadolint DL3045)
WORKDIR /app
COPY . .
EXPOSE 8080

RUN adduser --disabled-password --no-create-home appuser
USER appuser

CMD ["python", "main.py"]