// Configuración de las 5 entidades del panel. La interfaz se arma a partir de esta lista:
// agregar un microservicio nuevo es agregar un objeto acá (y su location en nginx.conf).
//
// formato: cómo se muestra el valor en la tabla (ver formato.js).
// degradado: texto que se muestra cuando una API externa no completó el campo. Hace visible
//            la decisión de arquitectura de guardar igual el registro si esa API falla.

export const ENTIDADES = [
  {
    key: 'clientes',
    titulo: 'Clientes',
    singular: 'cliente',
    tecnologia: 'Python · Flask',
    campos: [
      { name: 'nombre', label: 'Nombre y apellido', type: 'text' },
      { name: 'email', label: 'Email', type: 'email', sinCorrector: true },
      { name: 'dni', label: 'DNI', sinCorrector: true, type: 'text', inputmode: 'numeric', pattern: '[0-9]{7,8}', ayuda: '7 u 8 dígitos, sin puntos', formato: 'mono' },
    ],
  },
  {
    key: 'pagos',
    titulo: 'Pagos',
    singular: 'pago',
    tecnologia: 'Node.js · Express',
    total: 'monto_ars',
    campos: [
      { name: 'monto_ars', label: 'Monto (ARS)', type: 'number', min: '0.01', step: '0.01', formato: 'ars' },
      {
        name: 'medio_pago',
        label: 'Medio de pago',
        opciones: [
          ['transferencia', 'Transferencia'],
          ['tarjeta_debito', 'Tarjeta de débito'],
          ['tarjeta_credito', 'Tarjeta de crédito'],
          ['efectivo', 'Efectivo'],
        ],
      },
    ],
    soloLectura: [
      {
        name: 'monto_usd',
        label: 'Monto (USD)',
        formato: 'usd',
        degradado: 'Sin cotización',
        explicacion: 'La API externa de tipo de cambio no respondió: el pago se guardó igual, sin el monto en dólares.',
      },
    ],
  },
  {
    key: 'facturas',
    titulo: 'Facturas',
    singular: 'factura',
    tecnologia: 'Java · Spring Boot',
    total: 'monto',
    campos: [
      { name: 'numero', label: 'Número', sinCorrector: true, type: 'text', placeholder: 'A-0001', formato: 'mono' },
      { name: 'monto', label: 'Monto (ARS)', type: 'number', min: '0.01', step: '0.01', formato: 'ars' },
      { name: 'clienteId', label: 'ID de cliente', type: 'number', min: '1', step: '1', formato: 'mono' },
      { name: 'fechaEmision', label: 'Fecha de emisión', type: 'date', formato: 'fecha' },
    ],
  },
  {
    key: 'transacciones',
    titulo: 'Transacciones',
    singular: 'transacción',
    tecnologia: 'Go',
    total: 'monto',
    campos: [
      { name: 'origen_ip', label: 'IP de origen', sinCorrector: true, type: 'text', placeholder: '8.8.8.8', ayuda: 'Se usa para obtener el país', formato: 'mono' },
      { name: 'monto', label: 'Monto (ARS)', type: 'number', min: '0.01', step: '0.01', formato: 'ars' },
      { name: 'tipo', label: 'Tipo', type: 'text', sugerencias: ['compra', 'venta', 'transferencia', 'retiro'] },
    ],
    soloLectura: [
      {
        name: 'pais',
        label: 'País',
        degradado: 'Sin geolocalización',
        explicacion: 'La API externa de geolocalización no respondió o la IP es privada: la transacción se guardó igual, sin país.',
      },
    ],
  },
  {
    key: 'tarjetas',
    titulo: 'Tarjetas',
    singular: 'tarjeta',
    tecnologia: '.NET 8 · ASP.NET Core',
    total: 'limite',
    campos: [
      { name: 'alias', label: 'Alias', type: 'text', placeholder: 'Visa Gold' },
      { name: 'titular', label: 'Titular', type: 'text' },
      { name: 'tipo', label: 'Tipo', opciones: [['credito', 'Crédito'], ['debito', 'Débito']] },
      { name: 'limite', label: 'Límite (ARS)', type: 'number', min: '0', step: '0.01', formato: 'ars' },
    ],
  },
];
