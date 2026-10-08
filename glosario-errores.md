# Glosario de Errores

## Dockerización de la Base de Datos (db)

### 1. Puerto 3306 mapeado al host en docker-compose.yml
- **Error:** El servicio `db` tenía `ports: "3306:3306"`, lo que expone la base de datos al exterior de la red Docker, violando la consigna que indica que ninguna API ni la base de datos debe mapear puertos al host.
- **Solución:** Eliminar la directiva `ports` del servicio `db`. La comunicación con las APIs se realiza internamente a través de la red bridge de Docker usando DNS interno.

### 2. Servicio db sin red fintech_net
- **Error:** El servicio `db` no tenía la directiva `networks: [fintech_net]`, quedando en la red default de Docker mientras las APIs estaban en `fintech_net`. Esto impedía la comunicación por DNS interno entre la base de datos y las APIs.
- **Solución:** Agregar `networks: [fintech_net]` al servicio `db` para que comparta la misma red interna que el resto de los servicios.

### 3. Ruta incorrecta en el COPY del Dockerfile
- **Error:** El Dockerfile usaba `COPY db/init-scripts/ /docker-entrypoint-initdb.d/`, lo cual asume que el build context es la carpeta padre (`aplicaciones-contenedores/`) y no la carpeta `db/` donde vive el Dockerfile.
- **Solución:** Cambiar la ruta a `COPY init-scripts/ /docker-entrypoint-initdb.d/` para que sea relativa al build context correcto (`db/`).

## Dockerización de api-clientes (Python / Flask)

### 4. Dockerfile sin Multistage Build
- **Error:** El Dockerfile original usaba una sola etapa, dejando herramientas de compilación y cache de pip en la imagen final, aumentando su tamaño innecesariamente.
- **Solución:** Implementar un Multistage Build con dos etapas: una `builder` que crea el venv e instala las dependencias, y una `runtime` que solo copia el venv ya compilado y el código fuente.

### 5. Contenedor corriendo como usuario root
- **Error:** El Dockerfile no definía un usuario no privilegiado, por lo que el proceso Flask se ejecutaba como root dentro del contenedor, representando un riesgo de seguridad.
- **Solución:** Agregar `RUN adduser --disabled-password --no-create-home appuser` y `USER appuser` en la etapa de runtime, antes del `CMD`.

### 6. Puerto 8080 mapeado al host en docker-compose.yml
- **Error:** El servicio `api-clientes` tenía `ports: "8080:8080"`, exponiendo la API directamente al exterior. La consigna indica que solo el servicio `web` (NGINX) puede mapear puertos al host.
- **Solución:** Eliminar la directiva `ports` del servicio. La API recibe tráfico únicamente a través del proxy inverso NGINX por la red interna Docker.

### 7. Falta restart: always en docker-compose.yml
- **Error:** El servicio `api-clientes` no tenía la directiva `restart: always`, que la consigna exige para todos los servicios.
- **Solución:** Agregar `restart: always` al servicio `api-clientes` en el docker-compose.yml.

### 8. Rutas incorrectas en el COPY del Dockerfile
- **Error:** El Dockerfile usaba `COPY api-clientes/requirements.txt .` y `COPY api-clientes/ .`, asumiendo que el build context era la carpeta padre en lugar de la carpeta `api-clientes/` donde vive el Dockerfile.
- **Solución:** Cambiar las rutas a `COPY requirements.txt .` y `COPY . .` para que sean relativas al build context correcto.
