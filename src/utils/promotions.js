/**
 * Configuración de promociones
 */
const CONFIGURACION_PROMOCIONES = {
  // Promoción anterior: 14-21 Octubre 2025 (INACTIVA)
  promocion_oct_2025: {
    activa: false,  // ⚠️ Desactivada - ya venció
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
          fechaFinFija: new Date('2025-11-20T23:59:59-05:00')
        },
        {
          nombre: 'Simulación UPB',
          membershipPlanId: 10,
          usarFechaInicio: false,
          fechaFinFija: new Date('2026-04-08T23:59:59-05:00')
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
          fechaFinFija: new Date('2025-11-20T23:59:59-05:00')
        },
        {
          nombre: 'Simulación UPB',
          membershipPlanId: 10,
          usarFechaInicio: false,
          fechaFinFija: new Date('2026-04-08T23:59:59-05:00')
        }
      ]
    }
  },

  // ✨ Black Days Élite Octubre 2025: 28 Oct - 21 Nov
  black_days_oct_2025: {
    activa: true,
    inicio: new Date('2025-10-28T00:00:00-05:00'),
    fin: new Date('2025-11-21T23:59:59-05:00'),
    descripcion: 'Black Days Élite Octubre 2025',
    memberships: {
      'Élite - 6 meses': [
        {
          nombre: 'Élite 6 meses',
          membershipPlanId: 4,
          usarFechaInicio: true,
          membershipDurationDays: 250
        },
        {
          nombre: 'Simulación Univalle',
          membershipPlanId: 12,
          usarFechaInicio: true,
          // fechaInicioFija: new Date('2026-01-01T00:00:00-05:00'), // Comentado: ahora inicia desde fecha de compra
          fechaFinFija: new Date('2026-05-31T23:59:59-05:00')
        }
      ],
      'Élite - 9 meses': [
        {
          nombre: 'Élite 9 meses',
          membershipPlanId: 3,
          usarFechaInicio: true,
          membershipDurationDays: 372
        },
        {
          nombre: 'Simulación Univalle',
          membershipPlanId: 12,
          usarFechaInicio: true,
          // fechaInicioFija: new Date('2026-01-01T00:00:00-05:00'), // Comentado: ahora inicia desde fecha de compra
          fechaFinFija: new Date('2026-05-31T23:59:59-05:00')
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
  ],
  'Curso Intensivo UDEA 2026': [
    {
      nombre: 'Curso Intensivo UDEA 2026',
      membershipPlanId: 8,
      usarFechaInicio: false,
      fechaInicioFija: new Date('2025-11-01T00:00:00-05:00'),
      fechaFinFija: new Date('2026-05-31T23:59:59-05:00')
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
