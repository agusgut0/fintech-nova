# 🚀 FinTech Nova — Plataforma de Microservicios Distribuidos

<div align="center">

![Docker](https://img.shields.io/badge/Docker-24.0+-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker_Compose-v2-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11_Slim-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.3-000000?style=for-the-badge&logo=flask&logoColor=white)
![Go](https://img.shields.io/badge/Go-1.22_Alpine-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![MariaDB](https://img.shields.io/badge/MariaDB-11.8_UBI9-003545?style=for-the-badge&logo=mariadb&logoColor=white)
![Security](https://img.shields.io/badge/Security-Non--Root_&_Zero--Exposed--Ports-success?style=for-the-badge&logo=security&logoColor=white)

**Trabajo Práctico DevOps — Grupo 6**  
*Plataforma bancaria contenerizada con arquitectura de microservicios, aislamiento de red y endurecimiento de seguridad (hardening).*

Enunciado: (./Enunciado-TP-Parte-1.md)

[Imágenes en Docker Hub](#-imágenes-oficiales-en-docker-hub) • [Arquitectura](#-arquitectura-y-topología-de-red) • [Servicios](#-catálogo-de-servicios) • [Seguridad](#-decisiones-de-diseño-y-seguridad) • [Despliegue](#-guía-de-despliegue-local)

</div>

---

## 📌 1. Introducción a la Solución

**FinTech Nova** es una plataforma orientada a servicios financieros diseñada para operar bajo altos estándares de disponibilidad, seguridad y resiliencia.

Este repositorio implementa la infraestructura base de la plataforma mediante:
1. Un **servidor centralizado de persistencia relacional** (`MariaDB 11.8.9`) con aprovisionamiento automatizado y particionamiento lógico de esquemas.
2. Microservicios de dominio contenerizados:
   - **`api-clientes`** (Python 3.11 / Flask): empaquetado bajo Multistage Build y usuario no privilegiado (`appuser`).
   - **`api-transacciones`** (Go 1.22 / Alpine): compilación estática autónoma, multistage a imagen ultraligera Alpine, integración con API de geolocalización externa y usuario no privilegiado (`appuser`).
3. Una red interna aislada (`fintech_net`) que previene la exposición accidental de puertos al exterior y restringe el acceso estrictamente a resolución DNS interna.

---

## 🏗️ 2. Arquitectura y Topología de Red

El diseño de red sigue el principio de **menor exposición**: ningún contenedor de base de datos ni de API de lógica de negocio mapea puertos directamente al host.

```mermaid
flowchart TD
    subgraph Host [" Host / Entorno Externo "]
        User[Clientes / Web Traffic] -.->|Próximamente puerto 443| Nginx[Proxy Inverso / NGINX]
        GeoAPI["API Externa Geolocalización<br/>(ipapi.co :443)"]
    end

    subgraph InternalNet [" Red Interna Bridge (fintech_net) "]
        Nginx -.->|Ruteo Interno :8080| Clientes["api-clientes<br/>(Python 3.11 / Flask)<br/>User: appuser"]
        Nginx -.->|Ruteo Interno :8080| Transacciones["api-transacciones<br/>(Go 1.22 / Alpine)<br/>User: appuser"]
        
        Clientes -->|DNS interno 'db:3306'| DB["db<br/>(MariaDB 11.8.9 UBI9)<br/>User: mysql"]
        Transacciones -->|DNS interno 'db:3306'| DB
        Transacciones -.->|Salida HTTPS| GeoAPI
        
        Vol[(Volumen Persistente<br/>db_data)] -.->|Montaje /var/lib/mysql| DB
    end

    classDef secured fill:#1b4d3e,stroke:#2ecc71,stroke-width:2px,color:#fff;
    classDef storage fill:#2c3e50,stroke:#3498db,stroke-width:2px,color:#fff;
    classDef external fill:#2c3e50,stroke:#e67e22,stroke-width:2px,color:#fff;
    class Clientes,Transacciones,DB secured;
    class Vol storage;
    class GeoAPI external;
```

---

## 📦 3. Catálogo de Servicios

| Servicio | Lenguaje / Base | Puerto Interno | Mapeo al Host | Usuario Runtime | Límites (CPU / RAM) |
|---|---|---|---|---|---|
| **`db`** | `mariadb:11.8.9-ubi9` | `3306` | ❌ *Ninguno* | `mysql` | 0.50 CPU / 512 MB |
| **`api-clientes`** | `python:3.11-slim` | `8080` | ❌ *Ninguno* | `appuser` (UID no-root) | 0.30 CPU / 256 MB |
| **`api-transacciones`** | `golang:1.22` → `alpine:3.19` | `8080` | ❌ *Ninguno* | `appuser` (UID 1000) | 0.30 CPU / 256 MB |

> [!NOTE]
> Próximamente se integrarán los servicios `api-pagos` (Node.js), `api-facturas` (Java/Spring Boot), `api-tarjetas` (.NET) y el frontend `web` (NGINX con TLS en puerto 443).

---

## 🛡️ 4. Decisiones de Diseño y Hardening de Seguridad

### A. Compilación Multietapa (*Multistage Build*)
* **`api-clientes`:** Etapa 1 (`builder`) crea el entorno virtual (`/opt/venv`) e instala dependencias; Etapa 2 (`runtime`) parte de `python:3.11-slim` y solo copia el venv y código.
* **`api-transacciones`:** Etapa 1 (`builder`) descarga módulos con `go mod download` y compila un binario 100% estático e independiente con `CGO_ENABLED=0 GOOS=linux go build -o /app/server .`. Etapa 2 (`runtime`) parte de una imagen mínima `alpine:3.19` (~5 MB), copiando únicamente el binario compilado.
* **Beneficio:** Reducción drástica de superficie de ataque y tamaño de imagen (la imagen de Go pasa de ~800 MB a ~15 MB), eliminando compiladores y SDKs del contenedor de producción.

### B. Ejecución No Privilegiada (*Non-Root User*)
* **`api-clientes`:** `RUN adduser --disabled-password --no-create-home appuser` y ejecución bajo `USER appuser`.
* **`api-transacciones`:** `RUN adduser -D -H -u 1000 appuser` (sintaxis BusyBox/Alpine) y ejecución bajo `USER appuser`.
* **Beneficio:** Previene elevación de privilegios y ataques de escape de contenedor (*container breakout*).

### C. Red Aislada y Sin Puertos Expuestos
* Ni la base de datos ni las APIs exponen puertos hacia el host (`ports: "..."` eliminado deliberadamente).
* La comunicación inter-servicio se realiza exclusivamente mediante resolución DNS interna a través de la red `fintech_net` (`host: db`, `port: 3306`).
* `api-transacciones` solo tiene habilitada la salida hacia internet para resolver geolocalización contra `ipapi.co` vía HTTPS, incluyendo el paquete `ca-certificates` en Alpine para validar certificados raíz.

### D. Aislamiento Lógico de Bases de Datos
* Una única instancia de MariaDB aloja esquemas independientes (`db_clientes`, `db_transacciones`, `db_pagos`, etc.).
* El script inicial `00-databases.sh` crea las bases y asigna permisos específicos por microservicio bajo el principio de menor privilegio.

### E. Gestión de Secretos y Límites de Cómputo
* **Cero Secretos Hardcodeados:** Se desacoplan las variables de configuración mediante archivos `.env` y directivas `env_file`, excluidos en `.dockerignore` y `.gitignore`.
* **Protección contra DoS / Saturation:** Límites rígidos de recursos (`deploy.resources.limits`) aplicados para garantizar estabilidad en instancias t3.medium.

---

## 🚀 5. Guía de Despliegue Local

### Prerrequisitos
* [Docker Engine](https://docs.docker.com/engine/install/) versión 24.0 o superior.
* [Docker Compose](https://docs.docker.com/compose/) v2.x+.

### Pasos para levantar la plataforma

1. **Clonar el repositorio:**
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd enunciado-tp1/aplicaciones-contenedores
   ```

2. **Configurar las variables de entorno:**
   Copiar los archivos de ejemplo y configurar las credenciales locales:
   ```bash
   cp db/env.example db/.env
   cp api-clientes/env.example api-clientes/.env
   cp api-transacciones/env.example api-transacciones/.env
   ```

3. **Iniciar los servicios con Docker Compose:**
   ```bash
   docker compose up -d
   ```

4. **Verificar el estado de los contenedores:**
   ```bash
   docker compose ps
   ```

---

## 🐳 6. Imágenes Oficiales en Docker Hub

Las imágenes son construidas y versionadas siguiendo estándares semánticos:

* 🗄️ **Base de Datos:** [`fabripeveraro/db:1.0.0`](https://hub.docker.com/r/fabripeveraro/db)
* 👤 **API Clientes:** [`fabripeveraro/api-clientes:1.0.0`](https://hub.docker.com/r/fabripeveraro/api-clientes)
* 💳 **API Transacciones:** [`89768/api-transacciones:1.0.0`](https://hub.docker.com/r/89768/api-transacciones)

---

## 📈 7. Próximos Pasos Identificados

* [ ] Integración de **Healthchecks** activos en MariaDB para condicionar el arranque de APIs dependientes (`condition: service_healthy`).
* [ ] Incorporación de servidor WSGI de producción (`gunicorn`) para `api-clientes`.
* [ ] Integración de los 4 microservicios backend restantes.
* [ ] Configuración del reverse proxy NGINX con terminación TLS autofirmada en puerto 443.
* [ ] Script de despliegue automatizado `deploy.sh` en instancia EC2 de AWS.
* [ ] **Gestión Centralizada de Secretos:** Reemplazar progresivamente los archivos `.env` locales por mecanismos centralizados de gestión de secretos (ej. AWS Secrets Manager o HashiCorp Vault) al escalar a entornos productivos.
