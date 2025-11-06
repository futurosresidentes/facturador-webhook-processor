/**
 * Script para exportar contacts y memberships desde Render PostgreSQL
 * Usa la API de Render o conexión directa si está disponible
 */

const fs = require('fs');
const path = require('path');

// Nota: Este script requiere que temporalmente vuelvas a conectar a Render
// para exportar los datos que faltan

const API_KEY = process.argv[2];
const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL || 'postgresql://facturador_db_user:PASSWORD@dpg-XXXXXX/facturador_db';

if (!API_KEY) {
  console.error('❌ Falta API Key de Render');
  console.error('Uso: node 4-export-contacts-memberships.js <RENDER_API_KEY>');
  process.exit(1);
}

async function exportFromAPI() {
  const axios = require('axios');

  const renderAPI = axios.create({
    baseURL: 'https://facturador-webhook-processor.onrender.com/api',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('📤 Exportando contacts y memberships desde Render...\n');

  // Nota: Necesitarás crear endpoints temporales para exportar estos datos
  // O usar un cliente PostgreSQL directo si tienes las credenciales

  console.log('⚠️  MANUAL: Este script requiere acceso directo a la BD de Render');
  console.log('');
  console.log('Opciones:');
  console.log('1. Conectarte temporalmente a Render PostgreSQL con psql');
  console.log('2. Crear endpoints temporales /api/export/contacts y /api/export/memberships');
  console.log('3. Usar la copia de respaldo que tienes de la BD');
  console.log('');
  console.log('Comandos SQL para extraer los datos:');
  console.log('');
  console.log('-- Exportar contacts');
  console.log('COPY (SELECT * FROM contacts) TO STDOUT WITH CSV HEADER;');
  console.log('');
  console.log('-- Exportar memberships');
  console.log('COPY (SELECT * FROM memberships) TO STDOUT WITH CSV HEADER;');
}

exportFromAPI().catch(console.error);
