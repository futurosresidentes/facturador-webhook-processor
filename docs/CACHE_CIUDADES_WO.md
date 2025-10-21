# Caché de Ciudades de World Office

## Descripción

Sistema de caché en memoria para almacenar el listado completo de ciudades de World Office (~1100 ciudades de Colombia). Permite búsqueda rápida y normalizada de ciudades para convertir nombres de ciudades a IDs requeridos por la API de World Office.

## Problema que resuelve

Cuando llega un webhook de ePayco, puede incluir un campo `x_customer_city` con el nombre de la ciudad (ej: "Medellín", "Bogotá", etc.). Sin embargo, la API de World Office requiere el **ID numérico** de la ciudad para crear/actualizar clientes.

Sin este sistema, tendríamos que:
- Consultar la API de WO por cada webhook (lento y costoso)
- O mantener un mapeo manual (difícil de mantener)

## Solución implementada

### 1. Caché automático en memoria
- Al iniciar el servidor, consulta la API de World Office y carga todas las ciudades en memoria
- El caché se refresca automáticamente cada 24 horas
- Muy liviano: ~1100 ciudades ocupan < 1MB en memoria

### 2. Búsqueda normalizada (fuzzy matching)
Maneja variaciones en el texto de entrada:
- Quita acentos: "Medellín" = "Medellin"
- Ignora mayúsculas/minúsculas: "BOGOTÁ" = "bogotá"
- Normaliza espacios múltiples
- Búsqueda exacta primero, luego búsqueda parcial

### 3. Ejemplos de matching exitoso

```javascript
"Medellín" → ID 1 (Medellín)
"MEDELLIN" → ID 1 (Medellín)
"Bogo" → ID (partial match)
"Bogotá D.C." → ID (partial match)
```

## Uso en código

### En webhookProcessor.js o worldOfficeService.js

```javascript
const worldOfficeService = require('./worldOfficeService');

// Opción 1: findOrUpdateCustomer ya lo hace automáticamente
await worldOfficeService.findOrUpdateCustomer({
  identityDocument: '1234567890',
  givenName: 'Juan',
  familyName: 'Pérez',
  email: 'juan@example.com',
  phone: '+573001234567',
  city: 'Medellín', // ← Se convertirá automáticamente a cityId
  address: 'Calle 123'
});

// Opción 2: Uso directo del caché
const city = await worldOfficeService.cityCache.findCityByName('Bogotá');
console.log(city);
// {
//   id: 123,
//   nombre: 'Bogotá',
//   nombreNormalizado: 'BOGOTA',
//   codigo: '11001',
//   departamento: 'Cundinamarca',
//   departamentoId: 15
// }
```

## API del caché

### `findCityByName(cityName)`
Busca una ciudad por nombre (con normalización)

```javascript
const city = await cityCache.findCityByName('Medellín');
// Retorna objeto de ciudad o null si no encuentra
```

### `findCityById(cityId)`
Obtiene una ciudad por ID

```javascript
const city = await cityCache.findCityById(1);
// Retorna objeto de ciudad o null
```

### `getCacheInfo()`
Obtiene información del estado del caché

```javascript
const info = cityCache.getCacheInfo();
// {
//   size: 1100,
//   lastFetchTime: '2025-10-21T01:00:00.000Z',
//   ageMs: 3600000,
//   ttlMs: 86400000,
//   isExpired: false
// }
```

### `refreshCache(force = false)`
Fuerza una actualización del caché

```javascript
await cityCache.refreshCache(true);
```

## Estructura de datos

### Ciudad en el caché

```javascript
{
  id: 1,                              // ID en World Office
  nombre: "Medellín",                 // Nombre original
  nombreNormalizado: "MEDELLIN",      // Nombre sin acentos/mayúsculas
  codigo: "5001",                     // Código DANE
  departamento: "Antioquia",          // Nombre del departamento
  departamentoId: 1                   // ID del departamento
}
```

## Configuración

### Variables de entorno requeridas (.env)

```bash
WORLDOFFICE_API_URL=https://api.worldoffice.cloud
WORLDOFFICE_API_TOKEN=eyJhbGciOiJIUzUxMiJ9...
```

## Logging

El sistema registra en logs:

```
[WO-CityCache] Consultando ciudades desde World Office API...
[WO-CityCache] 1100 ciudades cargadas exitosamente
[WO-CityCache] Ciudad encontrada (exacta): "Medellín" → ID 1 (Medellín)
[WO-CityCache] Ciudad encontrada (parcial): "Bogo" → ID 123 (Bogotá)
[WO-CityCache] Ciudad no encontrada: "Atlantis"
```

## Manejo de errores

### Si la API de WO no responde
- El caché queda vacío pero no falla el servidor
- Se loguea un warning
- Las búsquedas retornarán `null`
- El sistema intentará refrescar en el próximo ciclo de 24h

### Si llega una ciudad desconocida
- La búsqueda retorna `null`
- Se loguea un warning con el nombre de la ciudad
- El flujo continúa (WO puede usar ciudad por defecto)

## Performance

- **Inicialización**: ~1-2 segundos (consulta API una vez)
- **Búsquedas**: < 1ms (búsqueda en memoria)
- **Memoria utilizada**: < 1MB para ~1100 ciudades
- **Refresco automático**: Cada 24 horas (configurable en código)

## Mantenimiento

### Cambiar frecuencia de refresco

Editar en `src/services/worldOfficeCityCache.js`:

```javascript
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Cambiar aquí (en milisegundos)
```

### Forzar refresco manual

Puedes crear un endpoint admin (protegido) para refrescar:

```javascript
router.post('/admin/refresh-cities', authenticate, async (req, res) => {
  await worldOfficeService.cityCache.refreshCache(true);
  const info = worldOfficeService.cityCache.getCacheInfo();
  res.json({ success: true, cacheInfo: info });
});
```

## Testing

### Probar el matching

```javascript
const cityCache = require('./services/worldOfficeCityCache');

// Esperar que cargue
await new Promise(resolve => setTimeout(resolve, 3000));

// Probar búsquedas
console.log(await cityCache.findCityByName('Medellín'));
console.log(await cityCache.findCityByName('MEDELLIN'));
console.log(await cityCache.findCityByName('Bogo')); // Partial match
console.log(await cityCache.findCityByName('Ciudad Ficticia')); // null
```

## Notas importantes

1. **Primera carga**: El caché se inicializa automáticamente al cargar el módulo
2. **Ciudades con tildes**: El sistema maneja correctamente acentos y tildes
3. **Ciudades compuestas**: Nombres como "El Carmen De Viboral" funcionan correctamente
4. **Sin persistencia**: El caché está solo en memoria (se pierde al reiniciar el servidor, pero se recarga automáticamente)

## Próximos pasos

Cuando implementes la integración real con World Office:

1. En `worldOfficeService.js`, descomenta las líneas de la API real
2. Usa el `cityId` obtenido del caché en el payload:

```javascript
const payload = {
  document: customerData.identityDocument,
  name: customerData.givenName,
  lastName: customerData.familyName,
  email: customerData.email,
  phone: customerData.phone,
  cityId: cityId, // ← ID obtenido del caché
  address: customerData.address
};
const createResponse = await woClient.post('/customers', payload);
```
