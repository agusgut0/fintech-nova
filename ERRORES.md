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

### 24. Error `Group names may not be in the format sg-*` al crear el Security Group
- **Error:** Al lanzar la instancia desde la consola de AWS con un grupo de seguridad llamado `sg-tp1`, el asistente rechazó la operación con `Value (sg-tp1) for parameter GroupName is invalid. Group names may not be in the format sg-*`.
- **Causa:** AWS reserva el prefijo `sg-` para los identificadores internos de los grupos de seguridad (`sg-0abc...`), por lo que no permite usarlo como inicio de un nombre elegido por el usuario.
- **Solución:** Renombrar el grupo con un nombre que no comience con `sg-` (por ejemplo `tp1-sg`) o conservar el nombre propuesto por el asistente de lanzamiento (`launch-wizard-N`).

## Dockerización de api-pagos (Node.js / Express)

### 25. `"/api-pagos/package-lock.json": not found` al construir la imagen
- **Error:** En el primer build de la imagen (`docker build -t api-pagos:single -f api-pagos/Dockerfile .`), el paso `COPY api-pagos/package.json api-pagos/package-lock.json ./` falló con `failed to calculate checksum of ref ...: "/api-pagos/package-lock.json": not found`.
- **Causa:** No se había creado el archivo `package-lock.json`. El Dockerfile instala las dependencias con `npm ci`, que exige el archivo de bloqueo para reproducir exactamente las mismas versiones, por lo que no había nada que copiar en ese paso.
- **Solución:** Generar el archivo con `npm install --package-lock-only` dentro de `api-pagos/` (crea solo el `package-lock.json`, sin instalar `node_modules`), versionarlo en el repositorio y comprobar que `.dockerignore` no lo excluya. Con el archivo presente, `npm ci --omit=dev` instala las mismas versiones en cada build.

### 26. `Connection refused` al probar el servicio con `wget http://localhost:8080`
- **Error:** Al probar la imagen de `api-pagos` en un contenedor aislado, `wget http://localhost:8080/pagos` devolvía `Connection refused` aunque el servicio estaba levantado.
- **Causa:** La imagen final está basada en Alpine cuyo `wget`, al resolver `localhost`, intenta primero la dirección IPv6 (`::1`), mientras el servicio escucha en IPv4, por lo que la conexión es rechazada.
- **Solución:** Usar la dirección IPv4 explícita (`wget http://127.0.0.1:8080/pagos`). 

## HTTPS y certificados TLS

### 27. Contenedor `web` en bucle de reinicio por certificado inexistente (`cannot load certificate`)
- **Error:** Al ejecutar `docker compose up -d` el servicio `web` quedaba en estado `Restarting` y `docker logs web` mostraba `nginx: [emerg] cannot load certificate`.
- **Causa:** No se habían generado los certificados antes de levantar el stack, por lo que la carpeta `certs/` no existía en el host y NGINX no encontraba `cert.pem` ni `key.pem`.
- **Solución:** Crear la carpeta y generar el par de claves con OpenSSL **antes** de levantar el stack. 

### 28. `Permission denied` al leer `key.pem` desde NGINX
- **Error:** Con los certificados ya generados, `web` seguía reiniciándose y los logs indicaban `Permission denied` al cargar la clave privada `key.pem`.
- **Causa:** OpenSSL crea `key.pem` con permisos `600` y como dueño al usuario del host (uid 1000). El contenedor ejecuta NGINX con `USER nginx` (uid 101), por lo que el proceso de NGINX queda en la categoría "otros", sin ningún permiso.
- **Solución:** Aplicar `chmod 644 certs/key.pem certs/cert.pem` y reiniciar el servicio. Una alternativa más restrictiva es asignar la clave al uid de NGINX con `sudo chown 101:101 certs/key.pem` y dejarla en `600`.

## Configuración del entorno local

### 29. `docker compose config` falla por archivos `.env` inexistentes
- **Error:** Al ejecutar `docker compose config` (o `up`) en un clon limpio del repositorio, Docker Compose falló indicando que no encontraba el archivo `.env` de un servicio (por ejemplo `api-clientes/.env`).
- **Causa:** Los `.env` están excluidos en `.gitignore` para no versionar credenciales, por lo que no existen al clonar el repositorio. El compose los referencia mediante `env_file`.
- **Solución:** Copiar las plantillas `env.example` de cada servicio a `.env` (`cp env.example .env`) y completar los valores correspondientes antes de iniciar el stack.

### 30. Error `/bin/bash^M: bad interpreter` al inicializar base de datos por scripts en CRLF
- **Error:** Al ejecutar el despliegue automático con `deploy.sh` construyendo las imágenes en local desde Windows, el contenedor `web` no iniciaba, `api-facturas` quedaba en estado `(unhealthy)` por `Access denied for user 'app_user'@'%' to database 'db_facturas'`, y los logs de `dbPrincipal` mostraban `/usr/local/bin/docker-entrypoint.sh: /docker-entrypoint-initdb.d/00-databases.sh: /bin/bash^M: bad interpreter: No such file or directory`.
- **Causa:** En el entorno de desarrollo local (Windows), los archivos de inicialización en `db/init-scripts/` poseían saltos de línea CRLF (`\r\n`). Al ejecutarse el build local dentro de `deploy.sh`, las capas de la imagen `devopsgrupo6/db:1.0.0` se compilaron con el intérprete `^M`, impidiendo la ejecución de `00-databases.sh` al inicializar MariaDB en la EC2 y abortando la creación de los esquemas y permisos de usuario.
- **Solución:** Normalizar todos los scripts de `init-scripts/` a formato LF (`\n`), asegurar su persistencia en `.gitattributes` (`* text=auto eol=lf`), reconstruir y republicar la imagen `devopsgrupo6/db:1.0.0` en Docker Hub, y en la EC2 reiniciar el stack eliminando el volumen persistido anterior (`sudo docker compose down -v && sudo docker compose up -d`) para forzar una inicialización limpia.

## Pipeline de GitLab CI/CD y seguridad (Parte 2)

### 31. El pipeline cortaba en `image-scan` por vulnerabilidades `CRITICAL` con parche en 5 de las 7 imágenes
- **Error:** En la primera corrida con controles de seguridad (pipeline #16892), el job `image-scan` quedó en rojo para `web`, `db`, `api-transacciones`, `api-facturas` y `api-clientes`. Solo pasaron `api-pagos` y `api-tarjetas`, y `publish-image` no llegó a ejecutarse.
- **Causa:** No era una falla técnica sino la política funcionando: Trivy encontró vulnerabilidades `CRITICAL` que ya tenían versión corregida. En `web` (`nginx:1.25-alpine`), `libexpat` (CVE-2024-45491 y CVE-2024-45492) y `libxml2` (CVE-2024-56171). En `api-transacciones`, la librería estándar de Go 1.22 (CVE-2025-68121): el binario compilado lleva dentro la del compilador. En `api-clientes`, PyMySQL 1.1.0 (CVE-2024-36039). En `api-facturas`, ocho vulnerabilidades de Tomcat embebido 10.1.30 y una de `spring-webmvc` 6.1.13 (CVE-2026-47884). En `db`, `gosu`, un binario de la imagen oficial de MariaDB compilado con Go 1.24.6 (mismo CVE-2025-68121).
- **Solución:** Corregir lo que dependía de nosotros: en `web`, `RUN apk add --no-cache --upgrade libexpat libxml2`; en `api-transacciones`, compilar con `golang:1.25`; en `api-clientes`, `PyMySQL==1.1.1` (se verificó que se instala sin conflictos con Flask-MySQL); en `api-facturas`, fijar la versión de Tomcat (ver error 32). Las dos restantes se aceptaron como riesgo en la variable `ACCEPTED_CVES`, con justificación escrita en `SEGURIDAD.md` y revisión el 15/12/2026: `gosu` no establece conexiones TLS, y la corrección de `spring-webmvc` solo existe en la versión 7 (cambio mayor de Spring Boot) mientras que la API no usa vistas XSLT, que es la función afectada.

### 32. `Missing artifact org.apache.tomcat.embed:tomcat-embed-core:jar:10.1.58` al fijar la versión de Tomcat
- **Error:** Al agregar `<tomcat.version>10.1.58</tomcat.version>` al `pom.xml` de `api-facturas`, el editor marcó como faltantes `tomcat-embed-core`, `tomcat-embed-el` y `tomcat-embed-websocket` en la versión 10.1.58.
- **Causa:** El número de versión se tomó de la columna "Fixed Version" de Trivy sin comprobar que existiera en Maven Central. Esa versión no figura entre las publicadas: Apache Tomcat a veces omite números de versión. Según su página de seguridad, la corrección completa llega con la 10.1.59 y la última de la línea 10.1 es la 10.1.61.
- **Solución:** Fijar `<tomcat.version>10.1.61</tomcat.version>` en el `pom.xml` (propiedad que Spring Boot permite sobrescribir). Con eso desaparecieron las ocho vulnerabilidades de Tomcat del reporte. Lección: verificar en el repositorio oficial que una versión exista antes de fijarla.

### 33. `x509: certificate signed by unknown authority` intermitente en `image-scan`
- **Error:** En tres de los siete jobs de `image-scan`, Trivy terminó con `unable to find the specified image ... in ["docker" "containerd" "podman" "remote"]` y, como último motivo, `remote error: tls: failed to verify certificate: x509: certificate signed by unknown authority`. Los otros cuatro jobs de la misma corrida pasaron. Las tres primeras causas del mensaje (`docker`, `containerd` y `podman`) son normales en un runner sin Docker, porque Trivy las prueba primero.
- **Causa:** Trivy descarga la imagen directamente del registry del labsys por HTTPS, y ese certificado es de la facultad: ni siquiera el navegador lo reconoce como seguro. Algunos intentos lo rechazaban y otros no (no pudimos confirmar si por el runner o por el servidor). Además, cada job descargaba la imagen tres veces (reporte, tabla del log y regla de corte), por lo que había tres oportunidades de fallar. Intentamos obtener el certificado desde nuestras computadoras con `openssl s_client`, pero devolvió `Host desconocido`: el nombre del registry solo se resuelve dentro de la red de la facultad.
- **Solución:** No se desactivó la verificación del certificado (`TRIVY_INSECURE` fue descartado por comprometer la seguridad del escaneo). Se redujo la cantidad de descargas por imagen: primero se reemplazó el segundo `trivy image` por un `cat` del reporte ya generado y después se llegó a una única descarga (ver error 36). Con eso el error dejó de aparecer.

### 34. `dependency-scan` en naranja por `body-parser` 1.20.8 (CVE-2026-111181) en `api-pagos`
- **Error:** El job `dependency-scan` terminó con `exit code 1` y quedó en naranja, mostrando `body-parser` 1.20.8 con severidad `HIGH` y versión corregida 1.20.9. El job es informativo (`allow_failure`), por lo que no frenó el pipeline.
- **Causa:** El `package-lock.json` de `api-pagos` fijaba `body-parser` 1.20.8. La imagen instala con `npm ci`, que respeta el archivo de bloqueo al pie de la letra (ver error 25), así que esa era la versión que terminaba dentro de la imagen.
- **Solución:** Actualizar el archivo de bloqueo sin tocar `package.json` con `npm audit fix --package-lock-only`, que subió `body-parser` a 1.20.9 y `qs` a 6.16.2 dentro de los rangos ya permitidos. Después de eso `npm audit` informa 0 vulnerabilidades.

### 36. `trivy convert` no admite `--ignore-unfixed`
- **Error:** Para evitar descargar la imagen varias veces, se intentó reutilizar el reporte JSON con `trivy convert --severity CRITICAL --ignore-unfixed --exit-code 1`, pero ese comando no tiene la opción `--ignore-unfixed`.
- **Causa:** `trivy convert` solo ofrece filtros por severidad, archivo `.trivyignore` y política Rego. El filtro de vulnerabilidades sin parche corresponde al escaneo (`trivy image`), no a la conversión. Sin ese filtro, la regla habría cortado también por críticas sin corrección, en contra de la política definida.
- **Solución:** Pasar `--ignore-unfixed` al único `trivy image`, con todas las severidades, y generar la tabla del log y la regla de corte (`trivy convert --severity CRITICAL --exit-code 1`) a partir de ese mismo JSON. Así cada imagen se descarga una sola vez. Contrapartida: el reporte ya no incluye las vulnerabilidades sin parche; conservarlo completo exigiría una política Rego, y queda como mejora pendiente (`SEGURIDAD.md`, fila 23).

### 37. Comandos con `cut -d: -f2` interpretados como un mapa en el `.gitlab-ci.yml`
- **Error:** Líneas del `script` como `- (echo "$ACCEPTED_CVES" | ... | cut -d: -f2 > .trivyignore) || true` se leían como un par clave-valor en vez de como texto, algo que GitLab no acepta como comando de un job. `yamllint` no lo detectaba porque el archivo era YAML válido. Se encontró al revisar los tipos de cada elemento del `script`, antes de ejecutar el pipeline.
- **Causa:** En YAML, un `: ` (dos puntos seguidos de espacio) dentro de un texto sin comillas lo convierte en un mapa. El `-d: -f2` del comando `cut` lo producía.
- **Solución:** Escribir esos comandos como bloque literal (`- |`) y agregar una verificación que comprueba que todos los elementos de `script` sean texto.

### 38. Hadolint `DL3045`: `COPY` sin `WORKDIR` en `api-clientes`
- **Error:** Hadolint advirtió que el Dockerfile de `api-clientes` ejecutaba `COPY . .` en la etapa de runtime sin haber definido un `WORKDIR`.
- **Causa:** Sin `WORKDIR`, el directorio de trabajo es la raíz del sistema de archivos, así que el código (y los demás archivos del contexto de build) se copiaba a `/`.
- **Solución:** Agregar `WORKDIR /app` antes del `COPY . .` en la etapa `runtime`.

### 39. El registry del labsys no es accesible desde la EC2
- **Error:** Al preparar el despliegue, el nombre del registry del labsys no se pudo resolver desde fuera de la facultad: `nslookup` contra un DNS público devolvió `Non-existent domain`. La EC2 está en AWS, así que no habría podido hacer `docker pull` de las imágenes, sin importar la credencial usada.
- **Causa:** El registry solo existe dentro de la red de la facultad. Los runners del labsys lo alcanzan, pero una máquina externa no (coincide con el `Host desconocido` del error 33).
- **Solución:** El build y el escaneo siguen contra el registry interno, y `publish` sube a Docker Hub solo las imágenes que pasaron el stage `security`. La EC2 las descarga de Docker Hub con un token de solo lectura y con vencimiento.
