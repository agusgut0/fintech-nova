// Formato de los valores que devuelven las APIs, con la configuración regional argentina.

const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const USD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' });
// Las fechas llegan como "AAAA-MM-DD": se interpretan en UTC para que no se corran un día
const FECHA = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Devuelve el texto a mostrar, o null si el valor está vacío. */
export function formatear(valor, formato) {
  if (valor === null || valor === undefined || valor === '') return null;
  switch (formato) {
    case 'ars':
      return ARS.format(Number(valor));
    case 'usd':
      return USD.format(Number(valor));
    case 'fecha': {
      const d = new Date(String(valor).length === 10 ? `${valor}T00:00:00Z` : valor);
      return Number.isNaN(d.getTime()) ? String(valor) : FECHA.format(d);
    }
    default:
      return String(valor);
  }
}

/** Valores que se alinean a la derecha y usan tipografía monoespaciada. */
export const esNumerico = (formato) => formato === 'ars' || formato === 'usd';

export const formatearARS = (n) => ARS.format(n);

/** "hace 12 s", "hace 3 min" */
export function hace(ms) {
  const s = Math.round(ms / 1000);
  if (s < 5) return 'recién';
  if (s < 60) return `hace ${s} s`;
  return `hace ${Math.round(s / 60)} min`;
}
