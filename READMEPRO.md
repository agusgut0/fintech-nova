# Proyecto FinTech Nova - Grupo 6

## Introducción a la Solución
Este repositorio contiene la arquitectura inicial de despliegue basada en contenedores para la plataforma de microservicios FinTech Nova. La solución implementa la infraestructura base mediante un servidor centralizado de MariaDB y el primer microservicio desarrollado en Python (Flask) para la gestión de clientes, utilizando Docker y Docker Compose. El objetivo central fue asegurar el aislamiento, la persistencia de datos y la correcta comunicación interna de los componentes.

## Decisiones de Diseño
Durante la dockerización y orquestación inicial, se tomaron las siguientes decisiones técnicas:

*   **Imagen Base Optimizada:** Se utilizó la imagen oficial `python:3.11-slim` para el microservicio de clientes, reduciendo el tamaño del contenedor y manteniendo la compatibilidad exacta requerida por el código fuente.
*   **Entorno Virtual Aislado:** Se implementó la creación de un entorno virtual dentro de la imagen (`/opt/venv`) para instalar las librerías definidas en el `requirements.txt`, previniendo conflictos con los paquetes globales del sistema operativo Linux base.
*   **Gestión Segura de Credenciales:** Las variables de configuración y credenciales de acceso se externalizaron mediante archivos `.env`, evitando la exposición de datos sensibles y combinándolas con un riguroso archivo `.dockerignore`.
*   **Red de Comunicaciones Interna:** Se configuró una red personalizada (`fintech_net`), permitiendo que el microservicio de clientes se conecte de forma segura a la base de datos utilizando el nombre del contenedor o servicio (`mariadb_server`) como host.
*   **Persistencia de Datos:** Se configuró un volumen de Docker (`db_data`) asociado al directorio `/var/lib/mysql` de MariaDB para garantizar la retención de la información financiera ante reinicios de contenedores.
*   **Inicialización Automatizada:** Se estructuró el directorio de inicialización de la base de datos para automatizar la creación de esquemas y usuarios al primer arranque del contenedor.

## Posibles Mejoras Identificadas
Para las siguientes etapas de desarrollo e integración de los demás microservicios, se identificaron las siguientes mejoras:

*   **Validación de Disponibilidad (Healthchecks):** Incorporar directivas de salud en el `docker-compose.yml` para sincronizar el arranque del microservicio de clientes y asegurar que la base de datos esté completamente operativa antes de recibir conexiones.
*   **Optimización del Proceso de Build:** Evaluar la implementación de compilaciones multi-etapa (multistage builds) para separar las herramientas de compilación de las librerías de ejecución de Python.
*   **Gestión Centralizada de Secretos:** Reemplazar progresivamente los archivos `.env` locales por mecanismos de control de secretos más robustos a medida que el proyecto escale hacia múltiples entornos.