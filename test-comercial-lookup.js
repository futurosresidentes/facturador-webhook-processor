/**
 * Script de prueba para diagnosticar la búsqueda de comercial en World Office
 */

require('dotenv').config();
const axios = require('axios');

const config = {
  strapi: {
    apiUrl: process.env.STRAPI_API_URL,
    apiToken: process.env.STRAPI_API_TOKEN
  },
  worldOffice: {
    apiUrl: process.env.WORLD_OFFICE_API_URL,
    apiToken: process.env.WORLD_OFFICE_API_TOKEN
  }
};

async function testComercialLookup() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  TEST: Búsqueda de Comercial en Strapi + World Office');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  const comercialName = 'Giancarlo Aguilar Fonnegra';
  console.log('🔍 Buscando comercial:', comercialName);
  console.log('');

  try {
    // PASO 1: Buscar en Strapi
    console.log('📍 PASO 1: Buscando en Strapi...');
    console.log('   URL:', config.strapi.apiUrl + '/api/comerciales');
    console.log('   Token:', config.strapi.apiToken ? '✓ Configurado' : '✗ NO configurado');
    console.log('');

    const strapiClient = axios.create({
      baseURL: config.strapi.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.strapi.apiToken}`
      }
    });

    const strapiResponse = await strapiClient.get('/api/comerciales', {
      params: {
        'filters[nombre][$eq]': comercialName
      }
    });

    console.log('✅ Respuesta de Strapi:');
    console.log('   Status:', strapiResponse.status);
    console.log('   Datos encontrados:', strapiResponse.data?.data?.length || 0);

    if (strapiResponse.data?.data && strapiResponse.data.data.length > 0) {
      const comercialData = strapiResponse.data.data[0];
      console.log('   Comercial ID:', comercialData.id);
      console.log('   Nombre:', comercialData.nombre);
      console.log('   Cédula:', comercialData.numero_documento);
      console.log('');

      const cedulaComercial = comercialData.numero_documento;

      // PASO 2: Buscar en World Office
      console.log('📍 PASO 2: Buscando en World Office...');
      console.log('   URL:', config.worldOffice.apiUrl + '/api/v1/terceros/identificacion/' + cedulaComercial);
      console.log('   Token:', config.worldOffice.apiToken ? '✓ Configurado' : '✗ NO configurado');
      console.log('');

      const woClient = axios.create({
        baseURL: config.worldOffice.apiUrl,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': config.worldOffice.apiToken
        }
      });

      try {
        const woResponse = await woClient.get(`/api/v1/terceros/identificacion/${cedulaComercial}`);

        console.log('✅ Respuesta de World Office:');
        console.log('   HTTP Status:', woResponse.status);
        console.log('   Response Status:', woResponse.data?.status);
        console.log('   User Message:', woResponse.data?.userMessage);
        console.log('   Data:', JSON.stringify(woResponse.data?.data, null, 2));
        console.log('');

        if (woResponse.data?.status === 'OK' && woResponse.data?.data?.id) {
          const idWOComercial = woResponse.data.data.id;
          console.log('🎯 RESULTADO FINAL:');
          console.log('   ✅ ID Comercial en WO:', idWOComercial);
          console.log('   ✅ Nombre completo:', woResponse.data.data.nombreCompleto);
          console.log('');
          console.log('✨ El código DEBERÍA retornar:', idWOComercial);
          console.log('   Pero está retornando:', 2259);
        } else {
          console.log('❌ Respuesta no tiene el formato esperado');
          console.log('   Status:', woResponse.data?.status);
          console.log('   Data.id:', woResponse.data?.data?.id);
        }

      } catch (woError) {
        console.log('❌ Error al buscar en World Office:');
        console.log('   HTTP Status:', woError.response?.status);
        console.log('   Response Status:', woError.response?.data?.status);
        console.log('   Message:', woError.message);
        console.log('   Error completo:', JSON.stringify(woError.response?.data, null, 2));
      }

    } else {
      console.log('❌ No se encontró el comercial en Strapi');
    }

  } catch (error) {
    console.error('❌ Error general:', error.message);
    if (error.response) {
      console.log('   Response data:', error.response.data);
    }
  }
}

testComercialLookup();
