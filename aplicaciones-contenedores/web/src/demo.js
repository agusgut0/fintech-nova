// Modo demo: solo se incluye al compilar con "vite build --mode demo" (la demo pública de
// GitHub Pages). Reemplaza fetch para las rutas /api/* y responde desde memoria, imitando a las
// 5 APIs: mismas rutas, mismos campos y la misma degradación cuando "falla" una API externa.
// En el build normal (imagen de Docker) este archivo no se empaqueta.

const datos = {
  clientes: [
    { id: 1, nombre: 'Ana Torres', email: 'ana.torres@example.com', dni: '30111222' },
    { id: 2, nombre: 'Luis Fernández', email: 'luis.fernandez@example.com', dni: '28999888' },
    { id: 3, nombre: 'Sofía Martínez', email: 'sofia.martinez@example.com', dni: '35222111' },
  ],
  pagos: [
    { id: 1, monto_ars: 50000, medio_pago: 'transferencia', monto_usd: null },
    { id: 2, monto_ars: 12000, medio_pago: 'tarjeta_debito', monto_usd: 8.11 },
    { id: 3, monto_ars: 123456, medio_pago: 'tarjeta_credito', monto_usd: 83.42 },
  ],
  facturas: [
    { id: 1, numero: 'A-0001', monto: 45000, clienteId: 1, fechaEmision: '2026-10-03' },
    { id: 2, numero: 'A-0002', monto: 12000.5, clienteId: 2, fechaEmision: '2026-11-01' },
  ],
  transacciones: [
    { id: 1, origen_ip: '8.8.8.8', monto: 3000, tipo: 'compra', pais: 'United States' },
    { id: 2, origen_ip: '200.45.191.35', monto: 15800, tipo: 'transferencia', pais: 'Argentina' },
    { id: 3, origen_ip: '192.168.31.1', monto: 1500, tipo: 'retiro', pais: '' },
  ],
  tarjetas: [
    { id: 1, alias: 'Visa Gold', titular: 'Ana Torres', tipo: 'credito', limite: 500000 },
    { id: 2, alias: 'Débito sueldo', titular: 'Luis Fernández', tipo: 'debito', limite: 0 },
  ],
};

const COTIZACION = 1480;   // ARS por USD, fija para la demo
const esPrivada = (ip) => /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const esperar = () => new Promise((r) => setTimeout(r, 30 + Math.random() * 120));
const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function responder(metodo, ruta, cuerpo) {
  await esperar();
  const [, , servicio, id] = ruta.split('/');   // "/api/pagos/3" -> ["", "api", "pagos", "3"]
  const lista = datos[servicio];
  if (!lista) return json(404, { error: 'Servicio inexistente' });

  if (metodo === 'GET') return json(200, lista);

  if (metodo === 'DELETE') {
    const i = lista.findIndex((x) => x.id === Number(id));
    if (i < 0) return json(404, { error: 'No existe' });
    lista.splice(i, 1);
    return json(204);
  }

  if (metodo === 'POST') {
    const item = { id: Math.max(0, ...lista.map((x) => x.id)) + 1, ...JSON.parse(cuerpo || '{}') };
    // Igual que las APIs reales: el dato enriquecido puede faltar sin que falle el alta
    if (servicio === 'pagos') item.monto_usd = Math.round((item.monto_ars / COTIZACION) * 100) / 100;
    if (servicio === 'transacciones') item.pais = esPrivada(item.origen_ip) ? '' : 'Argentina';
    lista.push(item);
    return json(201, item);
  }
  return json(405, { error: 'Método no permitido' });
}

export function instalarDemo() {
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (entrada, opciones = {}) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    if (!url.startsWith('/api/')) return fetchOriginal(entrada, opciones);
    return responder((opciones.method || 'GET').toUpperCase(), url, opciones.body);
  };

  // Aviso fijo arriba de todo: que nadie la confunda con un sistema real
  const franja = document.createElement('div');
  franja.className = 'franja-demo';
  franja.append('Demo con datos de ejemplo: las APIs se simulan en el navegador. ');
  const enlace = document.createElement('a');
  enlace.href = 'https://github.com/agusgut0/fintech-nova';
  enlace.textContent = 'Ver el proyecto en GitHub';
  franja.append(enlace);
  document.body.prepend(franja);
}
