# web (Vite)

Consola de operaciones que consume las 5 APIs (clientes, pagos, facturas, transacciones y tarjetas).
Es JavaScript sin framework con Vite. Todas las llamadas van a rutas relativas `/api/<servicio>/...`.

## Qué muestra

- **Tablero de servicios:** una ficha por microservicio con estado, latencia y una mini gráfica de las últimas 12 mediciones. Se consulta cada 15 s. Las fichas son también las pestañas: se navegan con las flechas y la URL guarda la pestaña abierta (`#pagos`).
- **Degradación visible:** si fallan las APIs externas, el campo aparece como "Sin cotización" o "Sin geolocalización", en lugar de una celda vacía.
- **ABM:** alta con validación y errores en línea, estados de carga y de tabla vacía, y borrado con confirmación (doble clic en 4 s).

## Diseño

| Archivo | Contenido |
|---|---|
| `src/entidades.js` | Campos y formato de cada entidad. Para sumar un servicio, se agrega acá (y su `location` en `nginx.conf`). |
| `src/formato.js` | Montos, fechas y tiempos con `Intl` (es-AR). |
| `src/main.js` | Armado del DOM, sin `innerHTML`: los datos de las APIs van por `textContent`. |
| `src/style.css` | Tokens de color en variables CSS, modo claro y oscuro, y layout responsive (en mobile, las filas pasan a fichas). |

- **Fuentes:** IBM Plex Serif, Sans y Mono, instaladas con `@fontsource` y empaquetadas por Vite. Se sirven desde el mismo origen, así la CSP de NGINX (`default-src 'self'`) no tiene que habilitar CDNs.
- **Accesibilidad:** contraste WCAG AA en los dos temas, foco visible, pestañas con el patrón de WAI-ARIA, regiones `aria-live` para los avisos y `prefers-reduced-motion`.

## Cómo levantar en LOCAL (sin Docker)

### Opción A: con `npm run dev` (recomendado para desarrollar el front)
Vite trae un proxy configurado en `vite.config.js` que redirige cada `/api/<servicio>` al puerto
correspondiente en tu máquina. Para que funcione, corran las 5 APIs sueltas (ver el `README.md`
de cada `api-*`) en estos puertos:

| Servicio            | Puerto sugerido en local |
|----------------------|--------------------------|
| api-clientes         | 8081                     |
| api-pagos            | 8082                     |
| api-facturas         | 8083                     |
| api-transacciones    | 8084                     |
| api-tarjetas         | 8085                     |

```sh
cd web
npm ci
npm run dev
```
Abrir `http://localhost:5173`. Sin las APIs corriendo, el tablero muestra los 5 servicios "Sin respuesta".

### Opción B: build + servir estático (simula producción)
```sh
cd web
npm ci
npm run build      # genera dist/
npm run preview    # sirve dist/ en un puerto local, PERO sin el proxy de /api
```
Para probar `/api/...` de verdad como en producción hace falta el reverse proxy de NGINX — por
eso el flujo real de este TP es dockerizar `web/` con NGINX sirviendo `dist/` (ver Dockerfile a
crear) y usando `nginx/nginx.conf`, que ya viene armado con los 5 proxys.

## Docker
Este directorio **no incluye Dockerfile** — es parte de la consigna del TP escribirlo (multistage:
`node` para `npm run build`, `nginx` para servir `dist/` + `nginx/nginx.conf`). Ver el
`README.md` en la raíz de `tp-2026/`.
