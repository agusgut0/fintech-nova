#!/bin/sh
# Linting del codigo de las APIs y del frontend. Lo ejecuta el job "code-lint" del pipeline,
# una vez por lenguaje (parallel: matrix), cada uno en la imagen oficial de su lenguaje.
#
# Uso: sh ci/code-lint.sh <python|javascript|go|java|csharp>
#
# El reporte queda en lint-<lenguaje>.txt (artifact). El script termina con el codigo de
# salida del linter: el job falla si hay hallazgos, pero tiene allow_failure, asi que solo
# informa. El codigo es de la catedra: no cortamos el pipeline por estilo.
set -u

LANG_LINT="${1:?Indicar el lenguaje}"
APP_DIR="${APP_DIR:-aplicaciones-contenedores}"
ROOT="$(pwd)"
REPORT="$ROOT/lint-$LANG_LINT.txt"

# Ejecuta el linter, muestra la salida en el log y la guarda en el reporte.
# Devuelve el codigo de salida del linter (no el de tee).
run() {
  "$@" > "$REPORT.tmp" 2>&1
  rc=$?
  cat "$REPORT.tmp" >> "$REPORT"
  cat "$REPORT.tmp"
  rm -f "$REPORT.tmp"
  return $rc
}

: > "$REPORT"

case "$LANG_LINT" in
  python)
    # Ruff: errores y malas practicas de Python (api-clientes)
    pip install --quiet --no-cache-dir --root-user-action=ignore ruff==0.8.4
    run ruff check --no-cache "$APP_DIR/api-clientes"
    ;;

  javascript)
    # ESLint con las reglas recomendadas: api-pagos (Node, CommonJS) y web (navegador, ESM).
    # Se copia el codigo a un directorio temporal para no dejar node_modules en el repo.
    WORK=/tmp/eslint
    mkdir -p "$WORK"
    cp -r "$APP_DIR/api-pagos/src" "$WORK/api-pagos"
    cp -r "$APP_DIR/web/src" "$WORK/web"
    cd "$WORK" || exit 1
    npm init -y > /dev/null
    npm install --silent --no-audit --no-fund eslint@9.17.0 @eslint/js@9.17.0 globals@15.14.0
    cat > eslint.config.mjs <<'EOF'
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  { files: ["api-pagos/**/*.js"], languageOptions: { sourceType: "commonjs", globals: globals.node } },
  { files: ["web/**/*.js"], languageOptions: { sourceType: "module", globals: globals.browser } },
];
EOF
    run npx eslint api-pagos web
    ;;

  go)
    # go vet: errores probables (api-transacciones). gofmt: archivos sin el formato estandar.
    cd "$APP_DIR/api-transacciones" || exit 1
    run go vet ./...
    rc=$?
    UNFORMATTED="$(gofmt -l .)"
    if [ -n "$UNFORMATTED" ]; then
      echo "gofmt: archivos sin formato estandar:" | tee -a "$REPORT"
      echo "$UNFORMATTED" | tee -a "$REPORT"
      rc=1
    fi
    exit $rc
    ;;

  java)
    # Checkstyle con la guia de estilo de Google (api-facturas). Las violaciones se elevan
    # a error para que el job las marque.
    cd "$APP_DIR/api-facturas" || exit 1
    run mvn -B --no-transfer-progress org.apache.maven.plugins:maven-checkstyle-plugin:3.6.0:check \
      -Dcheckstyle.config.location=google_checks.xml \
      -Dcheckstyle.violationSeverity=warning \
      -Dcheckstyle.consoleOutput=true
    ;;

  csharp)
    # dotnet format: estilo y analizadores de .NET (api-tarjetas), sin modificar archivos
    cd "$APP_DIR/api-tarjetas" || exit 1
    dotnet restore --verbosity quiet > /dev/null
    run dotnet format ApiTarjetas.csproj --no-restore --verify-no-changes --verbosity normal
    ;;

  *)
    echo "Lenguaje no soportado: $LANG_LINT"
    exit 2
    ;;
esac
