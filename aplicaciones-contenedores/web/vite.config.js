import { defineConfig } from 'vite';

// En "npm run dev", Vite proxea /api/<servicio> al puerto correspondiente en localhost,
// simulando lo que en produccion hace NGINX (ver nginx/nginx.conf). Sirve para desarrollar
// el front corriendo las 5 APIs sueltas en el host (ver el README de cada api-*), sin tener
// que levantar todo el stack con Docker.
//
// "vite build --mode demo" genera la demo pública de GitHub Pages: APIs simuladas en el
// navegador (src/demo.js), servida en la subcarpeta /fintech-nova/ y con la CSP como <meta>,
// porque GitHub Pages no envía los headers que agrega NGINX.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: demo ? '/fintech-nova/' : '/',
    plugins: demo
      ? [{
          name: 'csp-demo',
          // Misma política que nginx.conf (frame-ancestors no aplica en <meta>)
          transformIndexHtml: (html) =>
            html.replace('<meta charset="UTF-8" />', `$&\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'" />`),
        }]
      : [],
    server: {
      proxy: {
        '/api/clientes': { target: 'http://localhost:8081', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
        '/api/pagos': { target: 'http://localhost:8082', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
        '/api/facturas': { target: 'http://localhost:8083', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
        '/api/transacciones': { target: 'http://localhost:8084', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
        '/api/tarjetas': { target: 'http://localhost:8085', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      },
    },
  };
});
