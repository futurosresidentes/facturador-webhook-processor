/**
 * Configuración de promociones
 */
const CONFIGURACION_PROMOCIONES = {
  promo_octubre_2024: {
    activa: true,
    inicio: new Date('2024-10-01T00:00:00Z'),
    fin: new Date('2024-10-31T23:59:59Z'),
    descripcion: 'Promoción Octubre 2024: CES y UPB incluidos',
    memberships: {
      'Élite - 6 meses': [
        {
          nombre: 'Élite 6 meses',
          membershipPlanId: 2,
          usarFechaInicio: true,
          membershipDurationDays: 186
        },
        {
          nombre: 'Simulación CES',
          membershipPlanId: 9,
          usarFechaInicio: false,
          membershipExpiryDate: '2025-11-21T04:59:59Z'
        },
        {
          nombre: 'Simulación UPB',
          membershipPlanId: 10,
          usarFechaInicio: false,
          membershipExpiryDate: '2026-04-09T04:59:59Z'
        }
      ],
      'Élite - 9 meses': [
        {
          nombre: 'Élite 9 meses',
          membershipPlanId: 3,
          usarFechaInicio: true,
          membershipDurationDays: 370
        },
        {
          nombre: 'Simulación CES',
          membershipPlanId: 9,
          usarFechaInicio: false,
          membershipExpiryDate: '2025-11-21T04:59:59Z'
        },
        {
          nombre: 'Simulación UPB',
          membershipPlanId: 10,
          usarFechaInicio: false,
          membershipExpiryDate: '2026-04-09T04:59:59Z'
        }
      ]
    }
  }
};

/**
 * Configuración estándar de memberships (sin promoción)
 */
const CONFIGURACION_ESTANDAR = {
  'Élite - 6 meses': [
    {
      nombre: 'Élite 6 meses',
      membershipPlanId: 2,
      usarFechaInicio: true,
      membershipDurationDays: 186
    }
  ],
  'Élite - 9 meses': [
    {
      nombre: 'Élite 9 meses',
      membershipPlanId: 3,
      usarFechaInicio: true,
      membershipDurationDays: 370
    }
  ]
};

/**
 * Obtiene la promoción activa en una fecha dada
 * @param {Date} fecha - Fecha a verificar
 * @returns {Object|null} - Objeto de promoción o null
 */
function obtenerPromocionActiva(fecha = new Date()) {
  for (const key in CONFIGURACION_PROMOCIONES) {
    const promo = CONFIGURACION_PROMOCIONES[key];
    if (promo.activa && fecha >= promo.inicio && fecha <= promo.fin) {
      return promo;
    }
  }
  return null;
}

/**
 * Obtiene la configuración de memberships para un producto
 * @param {string} productoBase - Nombre del producto base
 * @param {Date} fecha - Fecha a verificar (default: hoy)
 * @returns {Array} - Array de configuraciones de membership
 */
function obtenerConfiguracionMemberships(productoBase, fecha = new Date()) {
  const promocionActiva = obtenerPromocionActiva(fecha);

  if (promocionActiva && promocionActiva.memberships[productoBase]) {
    return promocionActiva.memberships[productoBase];
  }

  return CONFIGURACION_ESTANDAR[productoBase] || [];
}

module.exports = {
  CONFIGURACION_PROMOCIONES,
  CONFIGURACION_ESTANDAR,
  obtenerPromocionActiva,
  obtenerConfiguracionMemberships
};
