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

1. **Exposición en Registro Público (Docker Hub):** La imagen [`devopsgrupo6/web:1.0.0`](https://hub.docker.com/r/devopsgrupo6/web) es pública para permitir su descarga directa (`docker compose pull`) desde la instancia EC2. Si se ejecutara `RUN openssl req ...` dentro del `Dockerfile`, la clave privada `key.pem` quedaría **embebida de forma permanente en las capas de la imagen pública**. Cualquier usuario en Internet podría ejecutar `docker pull devopsgrupo6/web:1.0.0`, extraer `key.pem` y comprometer el canal TLS (ataques *Man-in-the-Middle* o descifrado pasivo de tráfico).
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

---

## 4. Seguridad integrada en el pipeline (Parte 2)

Desde la Parte 2 los controles de seguridad no son un paso manual: se ejecutan automáticamente en cada corrida del pipeline de GitLab y, según la política definida más abajo, pueden impedir que una imagen se publique y se despliegue. Los jobs están definidos en el [`.gitlab-ci.yml`](./.gitlab-ci.yml) (`dockerfile-lint` en el stage `validate`; `secret-scan`, `sast`, `dependency-scan` e `image-scan` en el stage `security`).

### 4.1 Herramientas elegidas y por qué

| Categoría | Herramienta | Job | Por qué la elegimos |
|---|---|---|---|
| Secretos en el repositorio | Gitleaks | `secret-scan` | Revisa también el **historial** de git: un secreto borrado de un commit sigue siendo recuperable. Es el control que respalda el requisito de cero secretos en el repositorio. |
| Análisis estático (SAST) | Semgrep | `sast` | Cubre los cinco lenguajes del proyecto (Python, Java, JavaScript, Go y C#) con un único conjunto de reglas y permite filtrar por severidad, lo que hace posible nuestra política de corte. |
| Buenas prácticas en Dockerfiles | Hadolint | `dockerfile-lint` | Verifica usuario no-root, uso de WORKDIR, pinning y capas. Corre en el stage `validate`, antes del build, para fallar rápido. |
| Vulnerabilidades en imágenes | Trivy | `image-scan` | Analiza las siete imágenes construidas (sistema operativo y dependencias del binario) en paralelo, una por job. Cada imagen se descarga del registry **una sola vez**: el escaneo genera un reporte JSON y de ese mismo archivo salen la tabla del log y la regla de corte (`trivy convert`), sin volver a consultar el registry. |
| Dependencias e infraestructura como código | Trivy (modo sistema de archivos) | `dependency-scan` | Suma un análisis de las dependencias declaradas (`requirements.txt`, `package-lock.json`, `go.sum`, `pom.xml`) y de la configuración de los Dockerfiles, sin construir nada. |

Todos los controles se ejecutan en el runner del proyecto y guardan sus reportes como **artifacts** descargables desde el pipeline (JSON y, cuando corresponde, tabla de texto o SARIF), aun cuando el job falla. Como los paneles de seguridad de GitLab no están disponibles en todos los planes, los reportes se exportan como archivos.

Los controles que solo leen código (secretos, SAST, dependencias) arrancan junto con el pipeline y corren en paralelo con el build. Solo el escaneo de imágenes espera a que termine el build, porque necesita las imágenes publicadas con la etiqueta candidata.

### 4.2 Política ante vulnerabilidades

La decisión es **cortar solo lo que tiene una solución accionable hoy** y dejar todo lo demás registrado y visible.

| Control | El pipeline **corta** si… | El pipeline **informa** (no corta) |
|---|---|---|
| Secretos | Se detecta cualquier secreto en el historial. | — |
| SAST | Hay hallazgos de severidad `ERROR`. | `WARNING` e `INFO`. |
| Dockerfiles | Hay errores, o el último `USER` es root. | Advertencias y sugerencias. |
| Imágenes | Hay una vulnerabilidad `CRITICAL` **con parche disponible**. | Las de severidad menor con parche (`HIGH`, `MEDIUM`, `LOW`), que quedan en el reporte. |
| Dependencias e infraestructura | — (el job queda en estado de advertencia). | `HIGH` y `CRITICAL`. |

Como la publicación de las imágenes finales depende del stage de seguridad, un corte impide publicarlas y, en consecuencia, desplegarlas.

**Cómo se aplica la regla en las imágenes.** El job `image-scan` ejecuta `trivy image` una única vez, con `--ignore-unfixed` y todas las severidades, y guarda el resultado en un reporte JSON. De ese reporte se obtienen la tabla que se muestra en el log y la regla de corte, que es `trivy convert --severity CRITICAL --exit-code 1`: el job falla solo si el reporte contiene alguna vulnerabilidad `CRITICAL`, y como el reporte ya excluye las que no tienen parche, solo cuentan las corregibles. `trivy convert` no admite `--ignore-unfixed`, por eso el filtro se aplica en el escaneo.

**Limitación conocida.** Como consecuencia de lo anterior, el reporte de las imágenes **no incluye las vulnerabilidades sin parche** (de ninguna severidad), de modo que una crítica sin parche no se ve en los reportes. Se revisan al actualizar las imágenes base. Una mejora posible, que queda pendiente, es conservar el reporte completo y descartar las no corregidas solo en la regla de corte, mediante una política Rego (`--ignore-policy`).

**Justificación.** Un secreto expuesto o una vulnerabilidad crítica con parche son riesgos que se resuelven cambiando algo nuestro (rotar la credencial, actualizar la imagen base), por eso detienen el despliegue. En cambio, una vulnerabilidad crítica en una imagen base oficial que todavía no tiene parche no se puede corregir desde nuestro código: cortar el pipeline solo dejaría la última versión estable sin desplegar y no mejoraría la seguridad, por eso no corta. Una política más estricta, que corte también por `HIGH`, bloquearía el despliegue con frecuencia por hallazgos sin solución disponible.

### 4.3 Resumen de hallazgos

Análisis ejecutado el 15/11/2026 sobre el commit `3a17ffb`, con las mismas herramientas que usa el pipeline (en el caso de Semgrep, con las reglas públicas del proyecto en lugar del paquete `p/default`, por lo que el resultado en el pipeline puede diferir levemente). **El escaneo de imágenes con Trivy no pudo ejecutarse fuera del pipeline**, por lo que sus resultados se completan en esta sección con la primera corrida en GitLab.

| # | Control | Hallazgo | Estado | Detalle |
|---|---|---|---|---|
| 1 | Secretos | 45 commits y todas las ramas analizadas: **ningún secreto detectado**. | Sin hallazgos | Confirma que los `.env` y los certificados nunca llegaron al historial. |
| 2 | Hadolint | `api-clientes`: `COPY . .` sin `WORKDIR` (copiaba el código a la raíz del sistema de archivos). | **Corregido** | Se agregó `WORKDIR /app` en la etapa de runtime. |
| 3 | Hadolint | `api-pagos` y `api-transacciones`: paquetes de `apk add` sin versión fija. | Riesgo aceptado | Fijar la versión rompe el build cuando Alpine retira esa versión del repositorio. Se compensa con el escaneo de Trivy en cada build. |
| 4 | Hadolint | `api-transacciones`: dos `RUN` consecutivos. | Riesgo aceptado | Solo afecta el tamaño de las capas; no tiene impacto de seguridad. |
| 5 | Semgrep | `api-facturas`: el `ENV JAVA_TOOL_OPTIONS` no estaba entrecomillado y el analizador no pudo interpretarlo. Por la sintaxis de `ENV clave=valor`, solo la primera opción llegaba a `JAVA_TOOL_OPTIONS`. | **Corregido** | Se entrecomilló el valor completo, para que las tres opciones de ajuste de memoria y arranque se apliquen. |
| 6 | Semgrep | `api-clientes`: el servidor se inicia con `host='0.0.0.0'`. | Riesgo aceptado | Es necesario para que el contenedor reciba tráfico. La API no publica puertos; solo `web` es accesible desde Internet. |
| 7 | Semgrep | `api-transacciones`: servidor HTTP sin TLS. | Riesgo aceptado | El HTTPS termina en NGINX; el tramo hacia la API ocurre dentro de la red privada `fintech_net`. |
| 8 | Semgrep | `api-pagos`: sin middleware de protección CSRF. | Falso positivo | Es una API JSON sin cookies ni sesiones, que es el escenario donde ese ataque no aplica. |
| 9 | Semgrep | Imágenes base referenciadas por etiqueta y no por digest (informativo, todos los Dockerfiles). | Riesgo aceptado | Fijar digests exige un proceso de actualización. Se mitiga con el escaneo de cada imagen. |
| 10 | Dependencias | `api-pagos`: `body-parser` (severidad alta) y `qs` (moderada) con vulnerabilidades de denegación de servicio. | **Corregido** | Se actualizó `package-lock.json` a `body-parser` 1.20.9 y `qs` 6.16.2, dentro de los rangos que ya admitía el proyecto. Quedó en 0 vulnerabilidades. |
| 11 | Dependencias | `api-clientes`: PyMySQL 1.1.0 con una vulnerabilidad `CRITICAL` (CVE-2024-36039, inyección SQL al usar JSON no confiable). | **Corregido** | Se actualizó a PyMySQL 1.1.1. Se verificó que se instala sin conflictos con Flask-MySQL y que no tiene avisos conocidos. Es el hallazgo del escaneo de la imagen `api-clientes`. |
| 12 | Dependencias | `api-clientes`: Flask 2.3.3, Werkzeug 2.3.7 y python-dotenv 1.0.1 con avisos conocidos (la mayoría en Werkzeug, ninguno `CRITICAL`). | **Pendiente** | Las versiones corregidas son Flask 3.1.3, Werkzeug 3.1.9 y python-dotenv 1.2.2. Requiere probar la compatibilidad con Flask-MySQL, que es una librería antigua. El job `dependency-scan` lo sigue informando. |
| 13 | Dependencias | `web`: `vite`/`esbuild` con una vulnerabilidad moderada del servidor de desarrollo. | Riesgo aceptado | Solo existe en la etapa de build; la imagen final contiene únicamente los archivos estáticos compilados y NGINX. |
| 14 | Revisión manual | `api-clientes/db_config.py` define valores por defecto de usuario y contraseña de base de datos (`testuser`/`testuserpass`) si faltan las variables de entorno. | **Pendiente** | Ninguna herramienta lo detecta como secreto, pero conviene eliminar los valores por defecto para que la aplicación falle si falta la configuración, en lugar de usar credenciales conocidas. |
| 15 | Revisión manual | `api-clientes` arranca con el servidor de desarrollo de Flask. | **Pendiente** | Reemplazarlo por un servidor de aplicaciones de producción es la mejora recomendada. |
| 16 | Trivy (imagen `web`) | 3 vulnerabilidades `CRITICAL` con parche en el sistema operativo de la imagen: `libexpat` (CVE-2024-45491 y CVE-2024-45492) y `libxml2` (CVE-2024-56171). | **Corregido** | Se agregó al Dockerfile una actualización puntual de esas dos librerías. A futuro conviene reemplazar `nginx:1.25-alpine`, una versión ya superada. |
| 17 | Trivy (imagen `api-transacciones`) | El binario compilado incluye la librería estándar de Go 1.22, con una vulnerabilidad `CRITICAL` (CVE-2025-68121, validación incorrecta de certificados TLS al reanudar sesiones). | **Corregido** | Se cambió el compilador de la etapa de build a Go 1.25. La imagen final solo cambia en el binario. |
| 18 | Trivy (imagen `api-facturas`) | 8 vulnerabilidades `CRITICAL` en Tomcat embebido 10.1.30 (CVE-2025-24813 y siete de 2026, entre ellas evasión de autenticación y de restricciones de seguridad). | **Corregido** | Se fijó `tomcat.version` en 10.1.61 en el `pom.xml`, la última versión de la línea 10.1 publicada por Apache Tomcat, que incluye las correcciones de las ocho. |
| 19 | Trivy (imagen `api-facturas`) | `spring-webmvc` 6.1.13: CVE-2026-47884 (ejecución remota de código por limitación incorrecta de ruta en `XsltView`). | Riesgo aceptado | Según Trivy, la corrección solo existe en la versión 7.x, que exige migrar a una versión mayor de Spring Boot. La API solo tiene un `@RestController`, sin vistas ni XSLT, por lo que la función afectada no se usa. Se registra en `ACCEPTED_CVES` con revisión el 15/12/2026. |
| 20 | Trivy (imagen `db`) | `gosu` (binario de la imagen oficial de MariaDB) compilado con Go 1.24.6: CVE-2025-68121. El sistema operativo de la imagen no tiene hallazgos. | Riesgo aceptado | `gosu` solo se usa al iniciar el contenedor para cambiar de usuario y no establece conexiones TLS, así que la falla no es explotable. Corregirlo depende de que la imagen oficial publique una versión nueva. Se registra en `ACCEPTED_CVES` con revisión el 15/12/2026. |
| 21 | Trivy (imágenes `api-pagos` y `api-tarjetas`) | Sin vulnerabilidades `CRITICAL` con parche. | Sin hallazgos | Pasaron el control en la primera corrida. |
| 22 | Pipeline / Trivy | Falla intermitente: en algunos jobs Trivy no reconocía el certificado del registry del labsys (`x509: certificate signed by unknown authority`) y no llegaba a analizar la imagen. | **Corregido** | Cada job descargaba la imagen del registry tres veces (reporte, tabla y regla de corte), lo que multiplicaba las posibilidades de fallar. Se pasó a **una sola descarga por imagen**: el reporte JSON se genera una vez y la tabla y el corte se calculan desde ese archivo. **No se desactivó la verificación TLS** (`TRIVY_INSECURE`) y no hizo falta cargar ningún certificado adicional. Detalle en `ERRORES.md` (errores 33 y 36). |
| 23 | Pipeline / Trivy | El reporte de imágenes no incluye las vulnerabilidades sin parche, porque `--ignore-unfixed` se aplica en el escaneo. | **Pendiente** | Se conserva la regla de corte definida en 4.2. Conservar el reporte completo exige una política Rego en el corte; queda como mejora. |

### 4.4 Gestión de los riesgos aceptados

Un riesgo aceptado de Trivy se registra agregando una entrada `imagen:CVE` a la variable `ACCEPTED_CVES` del `.gitlab-ci.yml` (la excepción vale solo para esa imagen, para no ocultar el mismo CVE en otra), y se documenta en la tabla 4.3 con tres datos: la imagen afectada, el motivo (por ejemplo, "sin parche publicado") y una fecha de revisión. No se acepta un riesgo sin justificación escrita.

### 4.5 Dónde ver los resultados

Cada ejecución del pipeline deja los reportes como artifacts de los jobs `secret-scan`, `sast`, `dockerfile-lint`, `dependency-scan` e `image-scan` (un reporte por imagen, `trivy-<servicio>.json` y `.txt`, que contiene las vulnerabilidades con parche). Los problemas que tuvimos con el pipeline y cómo se resolvieron están en [`ERRORES.md`](./ERRORES.md), errores 31 a 39.

---

## 5. Gestión de secretos en GitLab y autenticación contra el registry

> 🚧 **A completar por quien tenga a su cargo el despliegue (Parte C):** variables de CI/CD enmascaradas y protegidas, deploy token de solo lectura y autenticación de la EC2 contra el registry.
