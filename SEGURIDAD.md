# 🛡️ Documentación de Seguridad — FinTech Nova

Este documento detalla las decisiones de arquitectura de seguridad, el manejo de secretos, la estrategia de cifrado TLS y las prácticas de endurecimiento (*hardening*) implementadas en los contenedores y en la infraestructura de AWS EC2, alineadas con el estándar **[OWASP Docker Top 10](https://owasp.org/www-project-docker-top-10/)**.

---

## 1. Gestión de Secretos y Credenciales

En cumplimiento del principio de **cero secretos hardcodeados**, ninguna contraseña, cadena de conexión ni clave privada se encuentra escrita en el código fuente, en los `Dockerfile` ni en el archivo `docker-compose.yml`.

### A. Inyección mediante `env_file`
* Cada contenedor que requiere variables de configuración o credenciales de acceso a base de datos las recibe exclusivamente en tiempo de ejecución mediante la directiva `env_file` en [`docker-compose.yml`](./aplicaciones-contenedores/docker-compose.yml):
  * `db`: `db/.env` (`MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`)
  * `api-clientes`: `api-clientes/.env` (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `PORT`)
  * `api-pagos`: `api-pagos/.env`
  * `api-facturas`: `api-facturas/.env`
  * `api-transacciones`: `api-transacciones/.env`
  * `api-tarjetas`: `api-tarjetas/.env`
* En el repositorio únicamente se versionan archivos de plantilla (`env.example`) sin credenciales reales, documentando las variables requeridas por cada microservicio.

### B. Protección en Doble Capa (`.gitignore` y `.dockerignore`)
1. **Nivel Repositorio Git ([`.gitignore`](./.gitignore)):**
   * Se excluyen explícitamente los patrones `.env`, `.env.*` (exceptuando `!env.example`) y `**/certs/`. Esto impide que credenciales locales o claves privadas sean comiteadas accidentalmente al historial de Git.
2. **Nivel Contexto de Build (`.dockerignore` en cada microservicio):**
   * Todos los microservicios incluyen en su `.dockerignore` la exclusión de `.env` y archivos locales sensibles. De este modo, al ejecutar instrucciones `COPY . .` durante el `docker build`, los secretos locales **nunca ingresan al contexto de compilación ni quedan grabados en las capas públicas** de las imágenes subidas a Docker Hub.

### C. Transferencia Segura hacia AWS EC2 sin pasar por Git
Para aprovisionar los secretos en la instancia EC2 sin subirlos al repositorio:
* El script de automatización [`deploy.sh`](./deploy.sh) copia los archivos `.env` directamente desde la estación de trabajo local hacia los directorios de cada servicio en la instancia (`/home/ec2-user/aplicaciones-contenedores/<servicio>/.env`) a través de **`scp` sobre un túnel SSH cifrado**, autenticado mediante par de claves RSA (`fintech-key.pem` con permisos restrictivos `chmod 400`).
* Adicionalmente, durante el despliegue remoto se ejecuta `sed -i 's/\r$//' */.env` para asegurar que los archivos transferidos desde entornos Windows mantengan formato POSIX (`LF`) sin corromper las credenciales leídas por los contenedores en Linux.

### D. Principio de Menor Privilegio en Base de Datos
* Aunque los 5 microservicios comparten una única instancia de MariaDB (`db`), **ninguna API utiliza el usuario administrativo `root`**.
* El script de inicialización [`00-databases.sh`](./aplicaciones-contenedores/db/init-scripts/00-databases.sh) aprovisiona 5 esquemas independientes (`db_clientes`, `db_pagos`, `db_facturas`, `db_transacciones`, `db_tarjetas`) y otorga permisos al usuario de aplicación (`MYSQL_USER=app_user`), logrando aislamiento lógico por dominio.

---

## 2. Certificado y Clave Privada TLS: Generación en *Runtime*

El servicio `web` (NGINX) cifra la totalidad del tráfico entrante mediante **HTTPS en el puerto `8443`** utilizando un certificado X.509 autofirmado (RSA 2048 bits, SHA-256).

### A. ¿Por qué *Runtime* y NO *Build-Time*?
Se tomó la decisión consciente de **generar el certificado y su clave privada en *runtime* (tiempo de despliegue en el host EC2)** y descartar su generación en *build-time* (dentro del `Dockerfile` de `web`) por las siguientes razones de seguridad:

1. **Exposición en Registro Público (Docker Hub):** La imagen [`89768/web:1.0.0`](https://hub.docker.com/r/89768/web) es pública para permitir su descarga directa (`docker compose pull`) desde la instancia EC2. Si se ejecutara `RUN openssl req ...` dentro del `Dockerfile`, la clave privada `key.pem` quedaría **embebida de forma permanente en las capas de la imagen pública**. Cualquier usuario en Internet podría ejecutar `docker pull 89768/web:1.0.0`, extraer `key.pem` y comprometer el canal TLS (ataques *Man-in-the-Middle* o descifrado pasivo de tráfico).
2. **Desacoplamiento entre Artefacto Inmutable e Identidad del Entorno:** En el sandbox de AWS Academy Learner Lab, la dirección IP pública cambia en cada sesión de 2 horas. Generar el certificado en *runtime* en [`deploy.sh`](./deploy.sh) permite emitir el certificado con el *Common Name* exacto de la instancia activa (`-subj "/CN=${EC2_IP}"`) sin necesidad de reconstruir ni republicar la imagen de `web`.

### B. Implementación y Aislamiento del Certificado
1. Durante la ejecución de [`deploy.sh`](./deploy.sh), el script se conecta por SSH a la EC2 y genera el par `key.pem` y `cert.pem` dentro de `/home/ec2-user/aplicaciones-contenedores/certs/`:
   ```bash
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
       -keyout certs/key.pem \
       -out certs/cert.pem \
       -subj "/CN=${EC2_IP}"
   chmod 644 certs/key.pem certs/cert.pem
   ```
2. La carpeta `certs/` está excluida en [`.gitignore`](./.gitignore) (`**/certs/`), por lo que la clave privada jamás toca el repositorio Git.
3. En [`docker-compose.yml`](./aplicaciones-contenedores/docker-compose.yml), el directorio se inyecta en el contenedor `web` mediante un volumen de **solo lectura (`:ro`)**:
   ```yaml
   volumes:
     - ./certs:/etc/nginx/certs:ro
   ```
   De esta forma, incluso ante una eventual vulnerabilidad en el proceso de NGINX, el contenedor no posee permisos de escritura para adulterar ni sobrescribir los certificados del host.

---

## 3. Buenas Prácticas y Alineación con OWASP Docker Top 10

### A. D01: Ejecución con Usuarios No Privilegiados (*Secure User Mapping*)
Ningún contenedor de la plataforma ejecuta su proceso principal como `root` en la etapa de producción, mitigando el riesgo de escalada de privilegios hacia el kernel del host en caso de escape del contenedor:

| Servicio | Imagen Runtime | Usuario de Ejecución (`USER`) | Detalles de Endurecimiento |
|---|---|---|---|
| **`db`** | `mariadb:11.8.9-ubi9` | `mysql` | Usuario sin privilegios nativo de la imagen oficial UBI9 de MariaDB. |
| **`api-clientes`** | `python:3.11-slim` | `appuser` | Creado con `adduser --disabled-password --no-create-home appuser` (sin shell de login ni directorio `/home`). |
| **`api-pagos`** | `alpine:3.21` | `app` | Grupo y usuario de sistema (`addgroup -S app && adduser -S app -G app`), archivos copiados con `--chown=app:app` y proceso `init: true` (Tini) como PID 1. |
| **`api-facturas`** | `eclipse-temurin:21-jre-alpine` | `appuser` | Usuario de sistema UID `1000` sin contraseña ni directorio home (`adduser -D -H -u 1000 appuser`). |
| **`api-transacciones`** | `alpine:3.19` | `appuser` | Usuario de sistema UID `1000` (`adduser -D -H -u 1000 appuser`) ejecutando binario estático compilado con `CGO_ENABLED=0`. |
| **`api-tarjetas`** | `mcr.microsoft.com/dotnet/aspnet:8.0` | `appuser` | Usuario de sistema (`useradd --system --create-home appuser`). |
| **`web`** | `nginx:1.25-alpine` | `nginx` | Escucha en puerto no privilegiado **`8443`** (`>1024`), pre-creando `/var/run/nginx.pid` y asignando `chown -R nginx:nginx` sobre `/var/cache/nginx`, `/var/run/nginx.pid`, `/var/log/nginx` y `/etc/nginx/conf.d` para operar bajo `USER nginx` sin requerir `root` ni `CAP_NET_BIND_SERVICE`. |

### B. D02 y D03: *Multistage Builds* y Reducción de Superficie de Ataque (*Patch Management & Base Images*)
Se utilizaron exclusivamente imágenes base oficiales verificadas y variantes mínimas (`alpine`, `slim`, `jre-alpine`, `aspnet`, `ubi9`) combinadas con **compilación multietapa (*Multistage Builds*)** en los 6 servicios de aplicación:
* **Eliminación de herramientas de compilación en producción:** Los SDKs completos (`maven:3.9.6-eclipse-temurin-21-alpine`, `golang:1.22`, `mcr.microsoft.com/dotnet/sdk:8.0`, `node:20-alpine`) quedan descartados en la etapa `builder`.
* Las imágenes finales de *runtime* solo contienen el artefacto compilado (`.jar`, binario estático de Go, DLLs publicadas de .NET, estáticos HTML/CSS/JS de Vite o entorno virtual `/opt/venv` de Python), reduciendo drásticamente el tamaño de las imágenes y eliminando compiladores, gestores de paquetes (`mvn`, `npm`, `go`) y librerías de desarrollo que un atacante podría explotar en una intrusión (*Living off the Land*).

### C. D04 y D05: Segmentación de Red y Cierre de Puertos Inseguros (*Network Segmentation & Firewalling*)
* **Red interna aislada (`fintech_net`):** Todos los contenedores se comunican dentro de una red `bridge` definida por el usuario mediante resolución DNS interna de Docker (`db:3306`, `api-clientes:8080`, etc.).
* **Cero exposición directa de Backend y Persistencia:** Ni `db` (`3306`) ni las 5 APIs (`8080`) poseen bloque `ports:` en `docker-compose.yml`. Son inaccesibles desde Internet y desde redes externas al motor de Docker.
* **Único punto de entrada cifrado (`8443/tcp`):** Solo el proxy inverso `web` publica el puerto `8443:8443` con SSL/TLS activo. **El puerto `80` (HTTP sin cifrar) permanece cerrado** tanto en la configuración de NGINX como en el Security Group de AWS EC2.
* **Security Group de AWS EC2 bajo principio de mínimo acceso:**
  * Tráfico administrativo SSH (`22/tcp`) restringido exclusivamente a la IP pública de administración (`/32`).
  * Tráfico de aplicación restringido únicamente al puerto HTTPS `8443/tcp`.

### D. D07: Protección contra Agotamiento de Recursos (*Resource Limits & DoS Prevention*)
Para evitar que una fuga de memoria (*memory leak*), un pico de tráfico o el arranque intensivo de un contenedor degrade la instancia EC2 (`t3.medium`, 2 vCPU y 4 GiB de RAM) afectando al resto del ecosistema (*Noisy Neighbor* / Denegación de Servicio local), todos los contenedores tienen definidos límites estrictos en `deploy.resources.limits` y política de auto-recuperación `restart: always`:

| Servicio | Límite de CPU (`cpus`) | Límite de Memoria (`memory`) | Orquestación de Salud (`healthcheck`) |
|---|---|---|---|
| **`db`** | `0.50` vCPU | `512M` | `healthcheck.sh --connect --innodb_initialized` |
| **`api-facturas`** | `2.00` vCPU | `256M` | `wget --spider -q http://127.0.0.1:8080/facturas` + `JAVA_TOOL_OPTIONS` optimizado |
| **`api-clientes`** | `0.30` vCPU | `256M` | `depends_on: db (service_healthy)` |
| **`api-pagos`** | `0.30` vCPU | `256M` | `depends_on: db (service_healthy)` |
| **`api-transacciones`** | `0.30` vCPU | `256M` | `depends_on: db (service_healthy)` |
| **`api-tarjetas`** | `0.30` vCPU | `256M` | `depends_on: db (service_healthy)` |
| **`web`** | `0.30` vCPU | `256M` | `depends_on: api-facturas (service_healthy)` + resto `service_started` |
| **Total Máximo de RAM** | — | **2048 MB (2.0 GiB)** | Deja **2.0 GiB libres** para el kernel de Amazon Linux 2023 y el demonio de Docker. |

