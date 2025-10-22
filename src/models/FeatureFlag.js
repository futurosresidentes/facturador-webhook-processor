/**
 * FeatureFlag Model
 * Almacena switches de configuración que se pueden cambiar sin deployar
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FeatureFlag = sequelize.define('FeatureFlag', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'Identificador único del switch (ej: "MEMBERSHIPS_ENABLED")'
  },
  value: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'true = activado, false = desactivado'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Descripción de qué hace este switch'
  },
  updated_by: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Quién realizó el último cambio'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'feature_flags',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['key']
    }
  ]
});

// Cache en memoria para evitar queries constantes a la BD
let flagsCache = null;
let lastCacheUpdate = null;
const CACHE_TTL = 10000; // 10 segundos

/**
 * Obtener el valor de un feature flag
 * @param {string} key - Key del flag
 * @param {boolean} defaultValue - Valor por defecto si no existe
 * @returns {Promise<boolean>}
 */
FeatureFlag.isEnabled = async function(key, defaultValue = true) {
  try {
    // Usar cache si está fresco (menos de 10 segundos)
    const now = Date.now();
    if (flagsCache && lastCacheUpdate && (now - lastCacheUpdate) < CACHE_TTL) {
      return flagsCache[key] !== undefined ? flagsCache[key] : defaultValue;
    }

    // Actualizar cache
    const flags = await FeatureFlag.findAll();
    flagsCache = {};
    flags.forEach(flag => {
      flagsCache[flag.key] = flag.value;
    });
    lastCacheUpdate = now;

    return flagsCache[key] !== undefined ? flagsCache[key] : defaultValue;
  } catch (error) {
    console.error(`[FeatureFlag] Error leyendo flag ${key}:`, error.message);
    return defaultValue;
  }
};

/**
 * Actualizar el valor de un feature flag
 * @param {string} key - Key del flag
 * @param {boolean} value - Nuevo valor
 * @param {string} updatedBy - Quién hace el cambio
 * @returns {Promise<Object>}
 */
FeatureFlag.setFlag = async function(key, value, updatedBy = 'system') {
  try {
    const [flag, created] = await FeatureFlag.findOrCreate({
      where: { key },
      defaults: { value, updated_by: updatedBy }
    });

    if (!created) {
      await flag.update({
        value,
        updated_by: updatedBy,
        updated_at: new Date()
      });
    }

    // Invalidar cache
    flagsCache = null;
    lastCacheUpdate = null;

    return { key, value, updated_by: updatedBy, created };
  } catch (error) {
    console.error(`[FeatureFlag] Error actualizando flag ${key}:`, error.message);
    throw error;
  }
};

/**
 * Invalidar cache (forzar recarga en próxima lectura)
 */
FeatureFlag.invalidateCache = function() {
  flagsCache = null;
  lastCacheUpdate = null;
};

module.exports = FeatureFlag;
