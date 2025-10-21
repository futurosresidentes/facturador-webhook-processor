/**
 * Configuración de promociones
 */
const CONFIGURACION_PROMOCIONES = {
  // Promoción actual: 14-21 Octubre 2025
  promocion_oct_2025: {
    activa: true,
    inicio: new Date('2025-10-14T00:00:00-05:00'),
    fin: new Date('2025-10-21T23:59:59-05:00'),
    descripcion: 'Promoción Octubre 2025: CES y UPB incluidos',
    memberships: {
      'Élite - 6 meses': [
        {
          nombre: 'Élite 6 meses',
          membershipPlanId: 4,
          usarFechaInicio: true,
          membershipDurationDays: 288
        },
        {
          nombre: 'Simulación CES',
          membershipPlanId: 9,
          usarFechaInicio: false,
          membershipExpiryDate: '2025-11-20T23:59:59-05:00'
        },
        {
          nombre: 'Simulación UPB',
          membershipPlanId: 10,
          usarFechaInicio: false,
          membershipExpiryDate: '2026-04-08T23:59:59-05:00'
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
          membershipExpiryDate: '2025-11-20T23:59:59-05:00'
        },
        {
          nombre: 'Simulación UPB',
          membershipPlanId: 10,
          usarFechaInicio: false,
          membershipExpiryDate: '2026-04-08T23:59:59-05:00'
        }
      ]
    }
  }

  // 💡 Puedes agregar más promociones aquí siguiendo el mismo formato:
  // promocion_nombre: {
  //   activa: true,
  //   inicio: new Date('YYYY-MM-DDTHH:mm:ss-05:00'),
  //   fin: new Date('YYYY-MM-DDTHH:mm:ss-05:00'),
  //   memberships: {
  //     'Élite - 9 meses': [...],
  //     'Élite - 6 meses': [...]
  //   }
  // }
};

/**
 * Configuración estándar de memberships (sin promoción)
 */
const CONFIGURACION_ESTANDAR = {
  'Élite - 6 meses': [
    {
      nombre: 'Élite 6 meses',
      membershipPlanId: 4,
      usarFechaInicio: true,
      membershipDurationDays: 188
    }
  ],
  'Élite - 9 meses': [
    {
      nombre: 'Élite 9 meses',
      membershipPlanId: 3,
      usarFechaInicio: true,
      membershipDurationDays: 288
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
