import '@fontsource/ibm-plex-serif/500.css';
import '@fontsource/ibm-plex-serif/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';

import { ENTIDADES } from './entidades.js';
import { formatear, formatearARS, esNumerico, hace } from './formato.js';

// Un solo frontend para las 5 APIs. Todas las llamadas van a "/api/<servicio>": en producción
// NGINX reenvía cada prefijo a su contenedor (nginx/nginx.conf); en desarrollo lo hace el
// proxy de Vite (vite.config.js). Las fuentes se empaquetan con Vite y se sirven desde el
// mismo origen, así la Content-Security-Policy de NGINX puede seguir en default-src 'self'.

const SONDEO_MS = 15000;        // cada cuánto se consulta el estado de los servicios
const TIMEOUT_MS = 5000;        // a partir de acá un servicio se considera sin respuesta
const HISTORIAL = 12;           // latencias que se dibujan en la mini gráfica de cada tarjeta
const CONFIRMAR_MS = 4000;      // tiempo para confirmar un borrado

const estado = {
  activa: null,
  ultimoSondeo: 0,
  servicios: Object.fromEntries(ENTIDADES.map((e) => [e.key, { ok: null, ms: null, historial: [] }])),
  vistas: {},                   // nodos de cada sección, por clave de entidad
};

// ---------------------------------------------------------------------------------------
// Utilidades de DOM (sin innerHTML: todo el texto que viene de las APIs va por textContent)
// ---------------------------------------------------------------------------------------

function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'text') nodo.textContent = v;
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else if (v === true) nodo.setAttribute(k, '');
    else nodo.setAttribute(k, v);
  }
  nodo.append(...hijos.flat().filter((h) => h !== null && h !== undefined && h !== false));
  return nodo;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function icono(nombre) {
  // Íconos de trazo simple, dibujados a mano en una grilla de 24×24
  const trazos = {
    refrescar: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
    papelera: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
    aviso: ['M12 3 2 21h20L12 3z', 'M12 10v5', 'M12 18h.01'],
  };
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icono');
  for (const d of trazos[nombre]) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

function avisar(mensaje, tipo = 'ok') {
  const t = el('div', { class: `aviso aviso--${tipo}`, text: mensaje });
  document.querySelector('.avisos').appendChild(t);
  setTimeout(() => t.classList.add('aviso--saliendo'), 3500);
  setTimeout(() => t.remove(), 4000);
}

const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// "agregado" / "agregada" según el género del sustantivo (factura, transacción, tarjeta)
const concordar = (participio, entidad) =>
  /(a|ón)$/.test(entidad.singular) ? participio.replace(/o$/, 'a') : participio;

// ---------------------------------------------------------------------------------------
// Estado de los servicios: cada tarjeta del tablero es un contenedor distinto
// ---------------------------------------------------------------------------------------

async function sondear(entidad) {
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const inicio = performance.now();
  let ok = false;
  try {
    const res = await fetch(`/api/${entidad.key}`, { signal: ctrl.signal, cache: 'no-store' });
    ok = res.ok;
  } catch {
    ok = false;
  } finally {
    clearTimeout(corte);
  }
  const s = estado.servicios[entidad.key];
  s.ok = ok;
  s.ms = ok ? Math.round(performance.now() - inicio) : null;
  s.historial = [...s.historial, s.ms].slice(-HISTORIAL);
  pintarTarjeta(entidad);
}

async function sondearTodos() {
  await Promise.all(ENTIDADES.map(sondear));
  estado.ultimoSondeo = Date.now();
  pintarResumen();
}

function pintarTarjeta(entidad) {
  const s = estado.servicios[entidad.key];
  const tarjeta = document.getElementById(`tab-${entidad.key}`);
  tarjeta.dataset.estado = s.ok === null ? 'pendiente' : s.ok ? 'ok' : 'caido';
  tarjeta.querySelector('.tarjeta__estado-texto').textContent =
    s.ok === null ? 'Verificando…' : s.ok ? 'Operativo' : 'Sin respuesta';
  tarjeta.querySelector('.tarjeta__latencia').textContent = s.ms === null ? '— ms' : `${s.ms} ms`;

  // Mini gráfica: barras proporcionales a la latencia; una caída se dibuja como barra llena roja
  const maximo = Math.max(100, ...s.historial.filter((m) => m !== null));
  const desde = s.historial.length - HISTORIAL;
  tarjeta.querySelectorAll('.pulso span').forEach((barra, i) => {
    const valor = s.historial[desde + i];
    barra.className = valor === undefined ? '' : valor === null ? 'caida' : 'medida';
    const escala = valor === undefined ? 0 : valor === null ? 1 : Math.max(0.1, valor / maximo);
    barra.style.transform = `scaleY(${escala})`;   // transform y no height: no recalcula el layout
  });
}

function pintarResumen() {
  const caidos = ENTIDADES.filter((e) => estado.servicios[e.key].ok === false).length;
  const resumen = document.querySelector('.resumen-estado');
  resumen.dataset.estado = caidos ? 'caido' : 'ok';
  const texto = caidos
    ? `${caidos} de ${ENTIDADES.length} servicios sin respuesta`
    : `${ENTIDADES.length} de ${ENTIDADES.length} servicios operativos`;
  // Solo se reescribe si cambió: así el lector de pantalla no lo anuncia en cada control
  const nodo = resumen.querySelector('.resumen-estado__texto');
  if (nodo.textContent !== texto) nodo.textContent = texto;
  actualizarHace();
}

function actualizarHace() {
  if (!estado.ultimoSondeo) return;
  document.querySelector('.resumen-estado__hace').textContent =
    `Último control ${hace(Date.now() - estado.ultimoSondeo)}`;
}

// ---------------------------------------------------------------------------------------
// Tablero (pestañas): cada tarjeta muestra el estado de su servicio y abre su sección
// ---------------------------------------------------------------------------------------

function crearTablero() {
  const lista = el('div', { class: 'tablero', role: 'tablist', 'aria-label': 'Microservicios' });
  ENTIDADES.forEach((entidad, i) => {
    const tarjeta = el(
      'button',
      {
        class: 'tarjeta',
        id: `tab-${entidad.key}`,
        role: 'tab',
        type: 'button',
        'aria-controls': `panel-${entidad.key}`,
        'data-estado': 'pendiente',
        onclick: () => seleccionar(entidad.key, true),
      },
      el('span', { class: 'tarjeta__ruta', translate: 'no', text: `/api/${entidad.key}` }),
      el('span', { class: 'tarjeta__nombre', text: entidad.titulo }),
      el('span', { class: 'tarjeta__tecnologia', text: entidad.tecnologia }),
      el(
        'span',
        { class: 'tarjeta__pie' },
        el('span', { class: 'tarjeta__estado' },
          el('span', { class: 'punto', 'aria-hidden': 'true' }),
          el('span', { class: 'tarjeta__estado-texto', text: 'Verificando…' })),
        el('span', { class: 'tarjeta__latencia', text: '— ms' }),
      ),
      el('span', { class: 'pulso', 'aria-hidden': 'true' }, Array.from({ length: HISTORIAL }, () => el('span'))),
    );
    tarjeta.style.setProperty('--orden', i);   // escalonado de la animación de entrada
    lista.appendChild(tarjeta);
  });

  // Flechas, Inicio y Fin entre pestañas (patrón de tabs de WAI-ARIA)
  lista.addEventListener('keydown', (e) => {
    const claves = ENTIDADES.map((x) => x.key);
    const i = claves.indexOf(estado.activa);
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: claves.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    const clave = claves[(destino + claves.length) % claves.length];
    seleccionar(clave, true);
    document.getElementById(`tab-${clave}`).focus();
  });
  return lista;
}

function seleccionar(key, actualizarUrl = false) {
  if (!ENTIDADES.some((e) => e.key === key)) key = ENTIDADES[0].key;
  estado.activa = key;
  ENTIDADES.forEach((e) => {
    const activa = e.key === key;
    const tab = document.getElementById(`tab-${e.key}`);
    tab.setAttribute('aria-selected', String(activa));
    tab.tabIndex = activa ? 0 : -1;
    document.getElementById(`panel-${e.key}`).hidden = !activa;
  });
  if (actualizarUrl) history.replaceState(null, '', `#${key}`);
  if (!estado.vistas[key].cargada) cargar(ENTIDADES.find((e) => e.key === key));
}

// ---------------------------------------------------------------------------------------
// Secciones: formulario de alta a la izquierda, libro de registros a la derecha
// ---------------------------------------------------------------------------------------

function crearCampo(entidad, campo) {
  const id = `${entidad.key}-${campo.name}`;
  const control = campo.opciones
    ? el('select', { id, name: campo.name, required: true }, campo.opciones.map(([v, t]) => el('option', { value: v, text: t })))
    : el('input', {
        id,
        name: campo.name,
        type: campo.type,
        required: true,
        min: campo.min,
        step: campo.step,
        pattern: campo.pattern,
        inputmode: campo.inputmode,
        placeholder: campo.placeholder,
        autocomplete: 'off',
        spellcheck: campo.sinCorrector ? 'false' : undefined,
        list: campo.sugerencias ? `${id}-sugerencias` : undefined,
        'aria-describedby': campo.ayuda ? `${id}-ayuda` : undefined,
      });
  return el(
    'div',
    { class: 'campo' },
    el('label', { for: id, text: campo.label }),
    control,
    campo.ayuda && el('small', { id: `${id}-ayuda`, text: campo.ayuda }),
    campo.sugerencias && el('datalist', { id: `${id}-sugerencias` }, campo.sugerencias.map((s) => el('option', { value: s }))),
  );
}

function crearSeccion(entidad) {
  const columnas = [{ name: 'id', label: 'N.º', formato: 'mono' }, ...entidad.campos, ...(entidad.soloLectura || [])];

  const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const enviar = el('button', { type: 'submit', class: 'boton boton--primario', text: `Agregar ${entidad.singular}` });
  const form = el(
    'form',
    { class: 'alta', 'aria-labelledby': `alta-${entidad.key}` },
    el('h3', { id: `alta-${entidad.key}`, text: `${concordar('Nuevo', entidad)} ${entidad.singular}` }),
    entidad.campos.map((c) => crearCampo(entidad, c)),
    error,
    enviar,
  );

  const thead = el('thead', {}, el('tr', {},
    columnas.map((c) => el('th', { scope: 'col', class: esNumerico(c.formato) ? 'num' : undefined, text: c.label })),
    el('th', { scope: 'col' }, el('span', { class: 'sr-only', text: 'Acciones' }))));
  const tbody = el('tbody');
  const resumen = el('p', { class: 'panel__resumen', 'aria-live': 'polite' });
  const vacio = el('div', { class: 'libro__vacio', hidden: true },
    el('p', { text: `Todavía no hay ${entidad.titulo.toLowerCase()}.` }),
    el('p', { class: 'tenue', text: 'Cargá el primer registro con el formulario.' }));
  const fallo = el(
    'div',
    { class: 'libro__fallo', role: 'alert', hidden: true },
    icono('aviso'),
    el('div', {},
      el('p', { class: 'libro__fallo-titulo', text: `No se pudo leer /api/${entidad.key}` }),
      el('p', { class: 'libro__fallo-detalle tenue' })),
    el('button', { type: 'button', class: 'boton', text: 'Reintentar', onclick: () => cargar(entidad) }),
  );

  const seccion = el(
    'section',
    { class: 'panel', id: `panel-${entidad.key}`, role: 'tabpanel', 'aria-labelledby': `tab-${entidad.key}`, hidden: true },
    el(
      'header',
      { class: 'panel__cabecera' },
      el('div', {}, el('h2', { text: entidad.titulo }), resumen),
      el('button', { type: 'button', class: 'boton boton--fantasma', onclick: () => cargar(entidad) }, icono('refrescar'), el('span', { text: 'Actualizar' })),
    ),
    el(
      'div',
      { class: 'panel__cuerpo' },
      form,
      el(
        'div',
        { class: 'libro' },
        el('div', { class: 'libro__scroll', tabindex: '0', role: 'region', 'aria-label': `Listado de ${entidad.titulo.toLowerCase()}` },
          el('table', {}, thead, tbody)),
        vacio,
        fallo,
      ),
    ),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const datos = Object.fromEntries(new FormData(form).entries());
    entidad.campos.forEach((c) => {
      if (c.type === 'number') datos[c.name] = Number(datos[c.name]);
    });
    enviar.disabled = true;
    enviar.textContent = 'Guardando…';
    try {
      const res = await fetch(`/api/${entidad.key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      });
      if (!res.ok) throw new Error(`La API respondió ${res.status}${res.status === 429 ? ' (demasiadas peticiones)' : ''}.`);
      const creado = await res.json().catch(() => null);
      form.reset();
      avisar(`${capitalizar(entidad.singular)} ${concordar('agregado', entidad)}.`);
      await cargar(entidad, creado?.id);
    } catch (err) {
      error.textContent = err instanceof TypeError
        ? 'No hay conexión con el servicio. Revisá su estado en el tablero y volvé a intentar.'
        : `${err.message} Revisá los datos y volvé a intentar.`;
      error.hidden = false;
    } finally {
      enviar.disabled = false;
      enviar.textContent = `Agregar ${entidad.singular}`;
    }
  });

  estado.vistas[entidad.key] = { cargada: false, tbody, resumen, vacio, fallo, columnas };
  return seccion;
}

function filaEsqueleto(columnas) {
  return el('tr', { class: 'esqueleto', 'aria-hidden': 'true' }, [...columnas, null].map(() => el('td', {}, el('span'))));
}

async function cargar(entidad, idNuevo) {
  const v = estado.vistas[entidad.key];
  const tabla = v.tbody.closest('table');
  v.cargada = true;
  v.fallo.hidden = true;
  v.vacio.hidden = true;
  if (!v.tbody.children.length) v.tbody.replaceChildren(...Array.from({ length: 3 }, () => filaEsqueleto(v.columnas)));
  tabla.setAttribute('aria-busy', 'true');

  try {
    const res = await fetch(`/api/${entidad.key}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`La API respondió ${res.status}.`);
    const items = (await res.json()).sort((a, b) => b.id - a.id);   // los más nuevos arriba
    v.tbody.replaceChildren(...items.map((item) => crearFila(entidad, item, item.id === idNuevo)));
    v.vacio.hidden = items.length > 0;

    let texto = `${items.length} ${items.length === 1 ? entidad.singular : entidad.titulo.toLowerCase()}`;
    if (entidad.total && items.length) {
      const total = items.reduce((suma, it) => suma + (Number(it[entidad.total]) || 0), 0);
      texto += ` · total ${formatearARS(total)}`;
    }
    v.resumen.textContent = texto;
  } catch (err) {
    v.tbody.replaceChildren();
    v.resumen.textContent = '';
    v.fallo.querySelector('.libro__fallo-detalle').textContent =
      err instanceof TypeError
        ? 'El servicio no responde; puede estar reiniciándose. Probá de nuevo en unos segundos.'
        : `${err.message} Si persiste, revisá los logs del contenedor api-${entidad.key}.`;
    v.fallo.hidden = false;
  } finally {
    tabla.removeAttribute('aria-busy');
  }
}

function crearFila(entidad, item, esNueva) {
  const celdas = estado.vistas[entidad.key].columnas.map((col) => {
    // Los campos con opciones muestran su etiqueta ("Tarjeta de crédito"), no el valor crudo
    const opcion = col.opciones?.find(([valor]) => valor === item[col.name]);
    const texto = opcion ? opcion[1] : formatear(item[col.name], col.formato);
    const clases = [esNumerico(col.formato) && 'num', (col.formato === 'mono' || esNumerico(col.formato)) && 'mono']
      .filter(Boolean).join(' ') || undefined;
    if (texto === null && col.degradado) {
      // El dato enriquecido falta porque la API externa no respondió: se muestra como tal, no como vacío
      return el('td', { class: clases, 'data-label': col.label }, el('span', { class: 'degradado', title: col.explicacion, text: col.degradado }));
    }
    // data-label: en pantallas chicas cada fila se muestra como ficha, con la etiqueta al lado
    return el('td', { class: clases, translate: clases ? 'no' : undefined, 'data-label': col.label, text: texto ?? '—' });
  });

  const textoBorrar = el('span', { class: 'boton-borrar__texto', text: 'Borrar' });
  const borrar = el('button', { type: 'button', class: 'boton-borrar', 'aria-label': `Borrar ${entidad.singular} ${item.id}` }, icono('papelera'), textoBorrar);
  let temporizador;
  borrar.addEventListener('click', async () => {
    // Primer clic: pide confirmación. Segundo clic (dentro de 4 s): borra.
    if (!borrar.classList.contains('confirmando')) {
      borrar.classList.add('confirmando');
      textoBorrar.textContent = '¿Confirmar?';
      borrar.setAttribute('aria-label', `Confirmar el borrado de ${entidad.singular} ${item.id}`);
      temporizador = setTimeout(() => {
        borrar.classList.remove('confirmando');
        textoBorrar.textContent = 'Borrar';
        borrar.setAttribute('aria-label', `Borrar ${entidad.singular} ${item.id}`);
      }, CONFIRMAR_MS);
      return;
    }
    clearTimeout(temporizador);
    borrar.disabled = true;
    try {
      const res = await fetch(`/api/${entidad.key}/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`la API respondió ${res.status}.`);
      avisar(`${capitalizar(entidad.singular)} ${item.id} ${concordar('borrado', entidad)}.`);
      await cargar(entidad);
    } catch (err) {
      borrar.disabled = false;
      avisar(`No se pudo borrar: ${err instanceof TypeError ? 'no hay conexión con el servicio.' : err.message}`, 'error');
    }
  });

  return el('tr', { class: esNueva ? 'fila-nueva' : undefined }, celdas, el('td', { class: 'acciones' }, borrar));
}

// ---------------------------------------------------------------------------------------
// Armado de la página
// ---------------------------------------------------------------------------------------

function render() {
  document.querySelector('#app').append(
    el('a', { class: 'saltar', href: '#contenido', text: 'Saltar al contenido' }),
    el(
      'header',
      { class: 'cabecera' },
      el(
        'div',
        { class: 'marca' },
        el('p', { class: 'marca__antetitulo', text: 'Consola de operaciones' }),
        el('h1', { translate: 'no', text: 'FinTech Nova' }),
        el('p', { class: 'marca__bajada', text: 'Cinco microservicios en cinco lenguajes, detrás de un único proxy NGINX por HTTPS.' }),
      ),
      el(
        'div',
        { class: 'resumen-estado', 'data-estado': 'pendiente' },
        el('span', { class: 'punto', 'aria-hidden': 'true' }),
        el('div', {},
          el('p', { class: 'resumen-estado__texto', role: 'status', text: 'Verificando servicios…' }),
          el('p', { class: 'resumen-estado__hace tenue' })),
        el('button', { type: 'button', class: 'boton boton--fantasma boton--icono', 'aria-label': 'Volver a controlar los servicios', onclick: sondearTodos }, icono('refrescar')),
      ),
    ),
    el('nav', { class: 'navegacion', 'aria-label': 'Microservicios' }, crearTablero()),
    el('main', { id: 'contenido', tabindex: '-1' }, ENTIDADES.map(crearSeccion)),
    el(
      'footer',
      { class: 'pie' },
      el('p', { text: 'Proyecto académico de DevOps · UTN FRC · 2026' }),
      el('p', { class: 'tenue', text: 'Cada tarjeta es un contenedor distinto. El tráfico entra solo por NGINX (puerto 8443) y viaja por la red interna de Docker.' }),
    ),
    el('div', { class: 'avisos', role: 'status', 'aria-live': 'polite' }),
  );

  seleccionar(location.hash.slice(1));
  sondearTodos();
  setInterval(sondearTodos, SONDEO_MS);
  setInterval(actualizarHace, 5000);
  window.addEventListener('hashchange', () => seleccionar(location.hash.slice(1)));
}

// En la demo pública (vite build --mode demo) las APIs se simulan en el navegador antes de
// arrancar. MODE se reemplaza en tiempo de build: en el build normal la condición es falsa y
// Vite descarta demo.js por completo.
if (import.meta.env.MODE === 'demo') {
  import('./demo.js').then(({ instalarDemo }) => {
    instalarDemo();
    render();
  });
} else {
  render();
}
