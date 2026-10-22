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

## Dockerización de api-transacciones (Go)

### 9. Fallo de conexión con Docker Daemon en Windows (Named Pipe)
- **Error:** Al intentar compilar la imagen con `docker build`, se produjo el error `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine: El sistema no puede encontrar el archivo especificado`.
- **Causa:** El cliente CLI de Docker en Windows no encontraba el socket/named pipe de comunicación porque la aplicación Docker Desktop estaba cerrada o su motor no había finalizado de inicializar.
- **Solución:** Iniciar Docker Desktop y aguardar a que el servicio se encuentre en estado "Engine running" antes de ejecutar comandos contra el daemon.

### 10. Uso conceptual erróneo de `go run` e imagen base pesada en Runtime
- **Error:** El Dockerfile inicial utilizaba `FROM golang:1.22` tanto en builder como en runtime, y ejecutaba `RUN go run` para levantar la aplicación.
- **Causa:** Go es un lenguaje compilado que puede generar binarios estáticos autónomos. Mantener la imagen del SDK completo de Go (`golang:1.22`) en producción deja una imagen de ~800 MB con herramientas de compilación innecesarias, y la directiva `RUN` ejecuta comandos en tiempo de construcción (build-time) en vez de definir el proceso de arranque en runtime (`CMD`).
- **Solución:** Implementar un Multistage Build donde la etapa `builder` compila un binario estático mediante `CGO_ENABLED=0 GOOS=linux go build -o /app/server .`, y la etapa `runtime` utiliza una imagen base mínima `alpine:3.19` (reduciendo el tamaño final a ~15 MB) ejecutando el binario directamente con `CMD ["./server"]`.

### 11. Limpieza prematura de dependencias por uso de `go mod tidy` en Dockerfile
- **Error:** En la etapa builder se ejecutó `RUN go mod tidy` inmediatamente después de copiar únicamente `go.mod` y `go.sum`.
- **Causa:** `go mod tidy` analiza los archivos de código fuente `.go` para sincronizar las dependencias. Al no haberse copiado aún el código fuente al contenedor (para aprovechar la caché de Docker), el comando interpretaba que el proyecto carecía de código y eliminaba dependencias requeridas.
- **Solución:** Utilizar `RUN go mod download`, el cual descarga a la caché de módulos únicamente las dependencias declaradas en `go.mod` y `go.sum` sin requerir inspeccionar los archivos de código fuente.

### 12. Ausencia de certificados raíz TLS (ca-certificates) en imagen mínima
- **Error:** Posible fallo en las llamadas HTTPS que realiza el microservicio a la API externa de geolocalización (`https://ipapi.co`).
- **Causa:** Las imágenes ultraligeras de Alpine Linux no incluyen por defecto el paquete de certificados de autoridades certificadoras (CA) raíz, provocando potenciales errores del tipo `x509: certificate signed by unknown authority` en peticiones HTTPS salientes.
- **Solución:** Instalar explícitamente `ca-certificates` en la etapa de runtime mediante `RUN apk --no-cache add ca-certificates`.

### 13. Sintaxis incompatible de `adduser` para usuario no-root en Alpine
- **Error:** Se intentó crear el usuario no-root con los flags de Debian/Ubuntu (`adduser --disabled-password --no-create-home appuser`), lo que arroja error de argumentos no reconocidos en Alpine.
- **Causa:** Alpine utiliza la suite BusyBox de utilidades Linux, cuya convención de flags para `adduser` difiere de utilidades GNU/Debian.
- **Solución:** Emplear la sintaxis nativa de Alpine: `RUN adduser -D -H -u 1000 appuser` y fijar el contexto de ejecución con `USER appuser`.

### 14. Confusión entre Host DNS (`DB_HOST`) y Nombre de Base de Datos (`DB_NAME`)
- **Error:** Se configuró en `.env` la variable `DB_HOST=db_transacciones` y `DB_NAME=db_fintech`.
- **Causa:** Confusión entre el identificador del contenedor en la red Docker (`db`) y el esquema lógico de base de datos asignado al microservicio (`db_transacciones`).
- **Solución:** Asignar `DB_HOST=db` (nombre del servicio en `docker-compose.yml` resoluble por DNS interno) y `DB_NAME=db_transacciones` (esquema creado por el script `00-databases.sh`).

### 15. Omisión de tag semántico en push inicial a Docker Hub
- **Error:** Se realizó `docker push 89768/api-transacciones` sin especificar tag, publicándose por defecto como `:latest`, lo cual incumple la consigna del TP (`:1.0.0`).
- **Causa:** No explicitar la versión semántica durante el proceso de build/push.
- **Solución:** Etiquetar la imagen local existente con `docker tag 89768/api-transacciones:latest 89768/api-transacciones:1.0.0` y ejecutar el push correspondiente.

### 16. Error al inicializar script de bases de datos
- **Error:** En logs del contenedor de la base se generaba un error de interpretacion al iniciar databases.sh, lo que omitia la creacion de las bd
- **Causa:** mala configuracion del vscode
- **Solución:** Se cambia opcion CRLF por LF desde la barra inferior y guardamos nuevamente el archivo databases.sh

## Dockerización de web (Frontend Vite + NGINX)

### 17. Error `open Dockerfile: no such file or directory` al construir la imagen `web`
- **Error:** Al ejecutar `docker build -t 89768/web:1.0.0 .` se obtuvo `ERROR: failed to build: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory`.
- **Causa:** El comando se ejecutó desde la raíz del repositorio (`/c/devops/enunciado-tp1`) usando `.` como contexto de build, en lugar de ubicarse o apuntar al subdirectorio `aplicaciones-contenedores/web` donde residen el `Dockerfile` y los archivos del servicio.
- **Solución:** Posicionarse en el directorio del servicio (`cd aplicaciones-contenedores/web`) antes de correr `docker build -t 89768/web:1.0.0 .`, o bien indicar la ruta del contexto directamente: `docker build -t 89768/web:1.0.0 aplicaciones-contenedores/web`.

## Orquestación con Docker Compose

### 18. Error `services.db.healthcheck additional properties 'condition' not allowed`
- **Error:** Al ejecutar `docker compose pull` se produjo el error de validación `services.db.healthcheck additional properties 'condition' not allowed`.
- **Causa:** Se colocó la propiedad `condition: service_healthy` dentro del bloque `healthcheck:` del servicio `db`, además de dejar el comando de ejemplo `test: ["executable", "arg"]`. En Docker Compose, `healthcheck` define cómo evaluar la salud del propio contenedor, mientras que `condition: service_healthy` pertenece al bloque `depends_on` de los servicios consumidores.
- **Solución:** Quitar `condition: service_healthy` de `db.healthcheck`, definir un comando real de chequeo para MariaDB (`test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]`) y configurar `depends_on: { db: { condition: service_healthy } }` en cada una de las APIs.

### 19. Contenedor `web` en bucle de reinicio por `open() "/var/run/nginx.pid" failed (13: Permission denied)`
- **Error:** Al levantar el stack con `docker compose up -d`, el servicio `web` entraba en estado `Restarting` rechazando conexiones en `https://localhost:8443/`, y `docker logs web` arrojaba `nginx: [emerg] open() "/var/run/nginx.pid" failed (13: Permission denied)`.
- **Causa:** En Alpine Linux (`nginx:1.25-alpine`), `/var/run` es un enlace simbólico (*symlink*) que apunta a `/run`. El comando `chown -R nginx:nginx /var/run` no modifica los permisos del directorio destino `/run` (que sigue perteneciendo a `root`), por lo que el proceso ejecutado bajo `USER nginx` no tiene permisos para crear el archivo `nginx.pid`.
- **Solución:** Crear previamente el archivo `nginx.pid` en tiempo de build y asignarle permisos al usuario `nginx` (junto con `/etc/nginx/conf.d`) en el `Dockerfile`: `RUN touch /var/run/nginx.pid && chown -R nginx:nginx /var/cache/nginx /var/run/nginx.pid /var/log/nginx /etc/nginx/conf.d`.

## Control de versiones y formato de archivos
### 20. Error imagen publicada en Docker Hub con scripts de inicialización en formato CRLF
- **Error** La imagen publicada en Docker Hub no creaba las bases ni las tablas.
- **Causa** los scripts de inicialización tenían CRLF y el COPY los metió así en la imagen. Arreglar el editor o el archivo local no cambia una imagen ya subida. Además, Git en Windows puede reconvertirlos, y esos scripts solo corren con el volumen vacío.
- **Solucion** pasar a LF, agregar el .gitattributes, reconstruir y subir con el tag 1.0.1, actualizar el compose y el deploy, borrar el volumen donde ya se inicializó y verificar la imagen.

### 21. Demora excesiva en el arranque de `api-facturas` (Spring Boot) y tabla vacía al iniciar `web`
- **Error:** Al levantar el entorno con `docker compose up -d` y abrir el frontend, la tabla de facturas aparecía vacía mientras el resto de los microservicios ya respondían, demorando hasta 45,6 segundos en estar operativa.
- **Causa:** Dos factores combinados: por un lado, el servicio `web` utilizaba `depends_on` simple (`service_started`), por lo que NGINX abría el puerto `8443` apenas se creaba el contenedor de `api-facturas` sin esperar a que Tomcat escuchara en el puerto `8080`. Por otro lado, `api-facturas` tenía un límite restrictivo de `cpus: '0.30'` y la configuración por defecto de la JVM (compilador JIT C2 y carga ansiosa de beans), produciendo *CPU throttling* durante el arranque intensivo de la JVM, el escaneo de clases de Spring Boot y la inicialización de Hibernate/JPA.
- **Solución:** Se aplicaron mejoras progresivas:
  1. **En `docker-compose.yml`:** Se configuró un `healthcheck` en `api-facturas` (`wget --spider -q http://127.0.0.1:8080/facturas || exit 1`) junto con `condition: service_healthy` en el `depends_on` del servicio `web`, y se incrementó el límite de CPU a `cpus: '1.0'`, lo que redujo el arranque de **45,6s a 12s**.
  2. **En `api-facturas/.env` y luego en `api-facturas/Dockerfile`:** Primero se probó inyectar `JAVA_TOOL_OPTIONS=-XX:TieredStopAtLevel=1 -Dspring.main.lazy-initialization=true -Dspring.jmx.enabled=false` en `.env` (bajando a **6,5s**), y finalmente se incorporó directamente en la etapa `Runtime` del `Dockerfile` con comillas (`ENV JAVA_TOOL_OPTIONS="-XX:TieredStopAtLevel=1 -Dspring.main.lazy-initialization=true -Dspring.jmx.enabled=false"`) para que todos los flags (compilador JIT rápido C1, inicialización diferida de beans y desactivación de JMX) quedaran embebidos en la imagen publicada en Docker Hub, logrando reducir el tiempo de arranque a **~1s**.

## Automatización y Despliegue en AWS EC2

### 22. Error `bash: deploy.sh: No such file or directory` al ejecutar el script de despliegue
- **Error:** Al intentar lanzar el despliegue hacia la EC2 con `bash deploy.sh 54.208.66.109 "C:\Users\agust\Downloads\fintech-key.pem" --skip-build` desde Git Bash (`MINGW64`), la consola devolvió `bash: deploy.sh: No such file or directory`.
- **Causa:** La terminal se encontraba posicionada en el subdirectorio `/c/devops/enunciado-tp1/aplicaciones-contenedores`, mientras que `deploy.sh` reside en la raíz del repositorio (`/c/devops/enunciado-tp1`) y referencia internamente a `APP_DIR="aplicaciones-contenedores"`.
- **Solución:** Posicionarse en la raíz del repositorio (`cd /c/devops/enunciado-tp1`) y ejecutar el script utilizando rutas con barras POSIX en Git Bash: `bash deploy.sh 54.208.66.109 "/c/Users/agust/Downloads/fintech-key.pem" --skip-build`.

### 23. Campo `pais` vacío en `api-transacciones` al desplegar en AWS EC2 (`RateLimited` en `ipapi.co`)
- **Error:** Al dar de alta transacciones desde el frontend desplegado en AWS EC2 ingresando primero una IP privada (`192.168.31.1`) y luego una IP pública válida (`8.8.8.8`), los registros se persistían pero con la columna `pais` vacía. Al inspeccionar los logs remotos con `ssh -i "/c/Users/agust/Downloads/fintech-key.pem" ec2-user@54.208.66.109 "sudo docker logs api-transacciones"`, se obtuvo: `La API externa de geolocalizacion devolvio un error: RateLimited`.
- **Causa:** Por un lado, las direcciones privadas (RFC 1918 como `192.168.31.1`) no son enrutables en Internet y carecen de geolocalización por país; por otro lado, ante IPs públicas válidas (`8.8.8.8`), la API pública gratuita `https://ipapi.co` (sin API Key) aplica límites de tasa (*rate limiting*) compartidos sobre los rangos de direcciones IP de centros de datos de AWS EC2 (`us-east-1`).
- **Solución:** Se verificó mediante `docker logs` el correcto funcionamiento del diseño de *degradación elegante* (*fallback*) implementado en `geolocation.go`: cuando la API externa devuelve error o `RateLimited`, la función `obtenerPais()` lo registra en el log y retorna `""` en lugar de abortar la petición HTTP, permitiendo que la transacción se guarde en MariaDB sin interrumpir el ABM.

### 24. Error `Group names may not be in the format sg-*` al crear el Security Group
- **Error:** Al lanzar la instancia desde la consola de AWS con un grupo de seguridad llamado `sg-tp1`, el asistente rechazó la operación con `Value (sg-tp1) for parameter GroupName is invalid. Group names may not be in the format sg-*`.
- **Causa:** AWS reserva el prefijo `sg-` para los identificadores internos de los grupos de seguridad (`sg-0abc...`), por lo que no permite usarlo como inicio de un nombre elegido por el usuario.
- **Solución:** Renombrar el grupo con un nombre que no comience con `sg-` (por ejemplo `tp1-sg`) o conservar el nombre propuesto por el asistente de lanzamiento (`launch-wizard-N`).

## Dockerización de api-pagos (Node.js / Express)

### 25. `Connection refused` al probar el servicio con `wget http://localhost:8080`
- **Error:** Al probar la imagen de `api-pagos` en un contenedor aislado, `wget http://localhost:8080/pagos` devolvía `Connection refused` aunque el servicio estaba levantado.
- **Causa:** La imagen final está basada en Alpine cuyo `wget`, al resolver `localhost`, intenta primero la dirección IPv6 (`::1`), mientras el servicio escucha en IPv4, por lo que la conexión es rechazada.
- **Solución:** Usar la dirección IPv4 explícita (`wget http://127.0.0.1:8080/pagos`). 

## HTTPS y certificados TLS

### 26. Contenedor `web` en bucle de reinicio por certificado inexistente (`cannot load certificate`)
- **Error:** Al ejecutar `docker compose up -d` el servicio `web` quedaba en estado `Restarting` y `docker logs web` mostraba `nginx: [emerg] cannot load certificate`.
- **Causa:** No se habían generado los certificados antes de levantar el stack, por lo que la carpeta `certs/` no existía en el host y NGINX no encontraba `cert.pem` ni `key.pem`.
- **Solución:** Crear la carpeta y generar el par de claves con OpenSSL **antes** de levantar el stack. 

### 27. `Permission denied` al leer `key.pem` desde NGINX
- **Error:** Con los certificados ya generados, `web` seguía reiniciándose y los logs indicaban `Permission denied` al cargar la clave privada `key.pem`.
- **Causa:** OpenSSL crea `key.pem` con permisos `600` y como dueño al usuario del host (uid 1000). El contenedor ejecuta NGINX con `USER nginx` (uid 101), por lo que el proceso de NGINX queda en la categoría "otros", sin ningún permiso.
- **Solución:** Aplicar `chmod 644 certs/key.pem certs/cert.pem` y reiniciar el servicio. Una alternativa más restrictiva es asignar la clave al uid de NGINX con `sudo chown 101:101 certs/key.pem` y dejarla en `600`.

## Configuración del entorno local

### 28. `docker compose config` falla por archivos `.env` inexistentes
- **Error:** Al ejecutar `docker compose config` (o `up`) en un clon limpio del repositorio, Docker Compose falló indicando que no encontraba el archivo `.env` de un servicio (por ejemplo `api-clientes/.env`).
- **Causa:** Los `.env` están excluidos en `.gitignore` para no versionar credenciales, por lo que no existen al clonar el repositorio. El compose los referencia mediante `env_file`.
