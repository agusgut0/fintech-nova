#!/bin/sh
# Genera los 6 archivos .env para levantar el stack en LOCAL o en CI, con contraseñas aleatorias.
# Los env.example del repo tienen las claves vacías a propósito, para no versionar contraseñas.
# En AWS los .env no salen de acá: llegan desde variables de CI/CD de tipo File (ver PIPELINE.md).
#
# Uso (desde aplicaciones-contenedores/):  sh generar-env.sh
# No pisa un .env que ya exista: para regenerarlos, borrarlos antes (y hacer "docker compose down -v",
# porque la base se inicializa con la contraseña del primer arranque).
set -eu

cd "$(dirname "$0")"

clave() { openssl rand -hex 16; }

DB_USER="app_user"
DB_PASSWORD="$(clave)"

escribir() {
  destino="$1"
  if [ -f "$destino" ]; then
    echo "Ya existe $destino: no se modifica"
    return
  fi
  cat > "$destino"
  chmod 600 "$destino"
  echo "Creado $destino"
}

escribir db/.env <<EOF
MYSQL_ROOT_PASSWORD=$(clave)
MYSQL_DATABASE=db_clientes
MYSQL_USER=$DB_USER
MYSQL_PASSWORD=$DB_PASSWORD
EOF

for svc in clientes pagos facturas transacciones tarjetas; do
  escribir "api-$svc/.env" <<EOF
DB_HOST=db
DB_PORT=3306
DB_NAME=db_$svc
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
PORT=8080
EOF
done
