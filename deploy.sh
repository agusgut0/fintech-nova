#!/bin/bash
set -euo pipefail
# ==============================================================================
# AMI de Amazon Linux 2023 kernel-6.18
# t3.medium
# ==============================================================================

#==============================================================================
# Variables de configuración
# Uso: ./deploy.sh <EC2_IP> <SSH_KEY> [--skip-build]
# ==============================================================================
EC2_IP="${1:-}"
SSH_KEY="${2:-}"
SKIP_BUILD="${3:-}"

if [ -z "$EC2_IP" ] || [ -z "$SSH_KEY" ]; then
    echo "Uso: $0 <EC2_IP> <SSH_KEY> [--skip-build]"
    exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
    echo "Error: No se encontro el archivo con la clave SSH en '$SSH_KEY'."
    exit 1
fi

chmod 400 "$SSH_KEY"

EC2_USER="ec2-user"
APP_DIR="aplicaciones-contenedores"
REMOTE_DIR="/home/${EC2_USER}/$APP_DIR"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"

# ==============================================================================
# 1. Build y push de imagenes (local)
# ==============================================================================
if [ "$SKIP_BUILD" != "--skip-build" ]; then
    echo "==> Construyendo y subiendo imagenes a Docker Hub..."
    declare -A IMAGES=(
        ["db"]="devopsgrupo6/db:1.0.0"
        ["api-clientes"]="devopsgrupo6/api-clientes:1.0.0"
        ["api-pagos"]="devopsgrupo6/api-pagos:1.0.0"
        ["api-facturas"]="devopsgrupo6/api-facturas:1.0.0"
        ["api-transacciones"]="devopsgrupo6/api-transacciones:1.0.0"
        ["api-tarjetas"]="devopsgrupo6/api-tarjetas:1.0.0"
        ["web"]="devopsgrupo6/web:1.0.0"
    )

    for svc in "${!IMAGES[@]}"; do
        img="${IMAGES[$svc]}"
        echo "==> Build y Push de $svc ($img)..."
        docker build -t "$img" "$APP_DIR/$svc"
        docker push "$img"
    done
else
    echo "==> Omitiendo build y push de imagenes local (--skip-build activada)."
fi

# ==============================================================================
# 2. Instalación Docker Engine, plugin Compose y carpetas de trabajo en EC2
# ==============================================================================

echo "==> Configurando instancia EC2 ($EC2_IP)..."
ssh $SSH_OPTS "${EC2_USER}@${EC2_IP}" << EOF
    set -euo pipefail

    if ! command -v docker &> /dev/null; then
        echo "==> Instalando Docker Engine y OpenSSL..."
        sudo dnf update -y
        sudo dnf install -y docker openssl
        sudo systemctl enable --now docker
        sudo usermod -aG docker ${EC2_USER}
    fi

    if ! docker compose version &> /dev/null; then
        echo "==> Instalando plugin Docker Compose v2..."
        sudo mkdir -p /usr/libexec/docker/cli-plugins
        sudo curl -SL \
    "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-\$(uname -m)" \
            -o /usr/libexec/docker/cli-plugins/docker-compose
        sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
    fi
    
    mkdir -p "${REMOTE_DIR}/certs" \
            "${REMOTE_DIR}/db" \
            "${REMOTE_DIR}/api-clientes" \
            "${REMOTE_DIR}/api-pagos" \
            "${REMOTE_DIR}/api-facturas" \
            "${REMOTE_DIR}/api-transacciones" \
            "${REMOTE_DIR}/api-tarjetas"
EOF

# ==============================================================================
# 3. Copiado de archivos
# ==============================================================================

echo "==> Copiando docker-compose.yml y archivos .env a la EC2..."
scp $SSH_OPTS "$APP_DIR/docker-compose.yml" "${EC2_USER}@${EC2_IP}:${REMOTE_DIR}/docker-compose.yml"

for svc in db api-clientes api-pagos api-facturas api-transacciones api-tarjetas; do
    scp $SSH_OPTS "$APP_DIR/$svc/.env" "${EC2_USER}@${EC2_IP}:${REMOTE_DIR}/$svc/.env"
done

# ==============================================================================
# 4. Generación certificado TLS y despliegue del Docker Compose
# ==============================================================================

echo "==> Generando certificado TLS en runtime y desplegando contenedores..."
ssh $SSH_OPTS "${EC2_USER}@${EC2_IP}" << EOF
    set -euo pipefail
    cd "${REMOTE_DIR}"

    sed -i 's/\r$//' */.env docker-compose.yml

    if [ ! -f certs/cert.pem ] || [ ! -f certs/key.pem ]; then
        echo "==> Generando par TLS autofirmado con OpenSSl..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout certs/key.pem \
            -out certs/cert.pem \
            -subj "/CN=${EC2_IP}"
        chmod 644 certs/key.pem certs/cert.pem
    fi

    sudo docker compose pull
    sudo docker compose up -d
    sudo docker compose ps
EOF

# ==============================================================================
# 5. Pruebas de despliegue
# ==============================================================================

echo "==> Esperando que los servicios estén saludables en https://${EC2_IP}:8443 ..."
sleep 15

ENDPOINTS=("/" "/api/clientes" "/api/pagos" "/api/facturas" "/api/transacciones" "/api/tarjetas")

for ep in "${ENDPOINTS[@]}"; do
    STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" "https://${EC2_IP}:8443${ep}")
    echo "==> Probando https://${EC2_IP}:8443${ep} => HTTP ${STATUS}"
    if [ "$STATUS" != "200" ]; then
        echo "Error: El endpoint ${ep} devolvió HTTP ${STATUS}"
        exit 1
    fi
done

echo "==> Despliegue completado exitosamente en https://${EC2_IP}:8443"
