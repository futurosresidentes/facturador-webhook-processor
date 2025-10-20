# 🚧 Implementación Pendiente - Sistema de 10 Pasos

## 📋 Estado Actual

### ✅ Completado

1. **Arquitectura definida** - Ver [FLUJO_PROCESAMIENTO.md](FLUJO_PROCESAMIENTO.md)
2. **Modelo de base de datos actualizado** - Campos `current_stage` y `last_completed_stage` agregados
3. **Migración SQL creada** - [migrations/add_stage_tracking.sql](migrations/add_stage_tracking.sql)
4. **Servicios template creados**:
   - ✅ [src/services/worldOfficeService.js](src/services/worldOfficeService.js)
   - ✅ [src/services/strapiService.js](src/services/strapiService.js)
   - ✅ [src/services/callbellService.js](src/services/callbellService.js)
5. **Configuración ENV actualizada** - Variables agregadas en [src/config/env.js](src/config/env.js)

### 🔄 Pendiente de Implementar

1. **Ejecutar migración de base de datos**
2. **Configurar variables de entorno** con tus credenciales reales
3. **Implementar APIs reales** en los servicios (actualmente en modo MOCK)
4. **Refactorizar webhookProcessor** para usar el flujo de 10 pasos
5. **Implementar sistema de recuperación** por stage
6. **Actualizar endpoints** de consulta
7. **Testing completo**

---

## 🎯 Flujo de Procesamiento (10 Pasos)

```
1. ✅ Extraer Invoice ID          → invoice_extraction
2. ✅ Consultar FR360              → fr360_query
─────────────────────────────────────────────────────
   🎯 EXPERIENCIA DEL CLIENTE (Primero)
─────────────────────────────────────────────────────
3. ✅ Validar/Crear en CRM         → crm_upsert
4. ✅ Crear Membresías             → membership_creation
5. 🆕 Notificar Callbell           → callbell_notification
─────────────────────────────────────────────────────
   📄 FACTURACIÓN (Procesos internos)
─────────────────────────────────────────────────────
6. 🆕 Cliente en World Office      → worldoffice_customer
7. 🆕 Crear Factura                → worldoffice_invoice
8. 🆕 Contabilizar                 → worldoffice_accounting
9. 🆕 Emitir DIAN                  → worldoffice_dian
10. 🆕 Guardar en Strapi           → strapi_save
```

---

## 📝 Próximos Pasos para Ti

### Paso 1: Ejecutar Migración de Base de Datos

```bash
# Conectar a tu base de datos PostgreSQL
psql -h <host> -U <user> -d <database>

# Ejecutar la migración
\i migrations/add_stage_tracking.sql
```

O desde pgAdmin/DBeaver, ejecuta el contenido del archivo.

---

### Paso 2: Configurar Variables de Entorno

Agrega estas variables a tu `.env` (local) y a Render (producción):

```env
# ─────────────────────────────────────────
# World Office (Facturador)
# ─────────────────────────────────────────
WORLDOFFICE_API_URL=https://...
WORLDOFFICE_API_TOKEN=...
WORLDOFFICE_USERNAME=...
WORLDOFFICE_PASSWORD=...

# ─────────────────────────────────────────
# Strapi Facturación
# ─────────────────────────────────────────
STRAPI_API_URL=https://...
STRAPI_API_TOKEN=...

# ─────────────────────────────────────────
# Callbell (WhatsApp)
# ─────────────────────────────────────────
CALLBELL_API_URL=https://api.callbell.eu/v1
CALLBELL_API_KEY=...
```

---

### Paso 3: Implementar APIs Reales

Cada servicio tiene comentarios `// TODO:` donde debes implementar las llamadas reales a las APIs.

#### 3.1 World Office Service

Archivo: [src/services/worldOfficeService.js](src/services/worldOfficeService.js)

**Funciones a implementar:**

1. `findOrUpdateCustomer()` - Línea 35
   ```javascript
   // Buscar cliente por cédula
   const searchResponse = await woClient.get(`/customers/search`, {
     params: { document: customerData.identityDocument }
   });
   ```

2. `createInvoice()` - Línea 86
   ```javascript
   // Crear factura
   const response = await woClient.post('/invoices', {...});
   ```

3. `accountInvoice()` - Línea 116
   ```javascript
   // Contabilizar
   const response = await woClient.post(`/invoices/${invoiceId}/account`, {...});
   ```

4. `emitDianInvoice()` - Línea 146
   ```javascript
   // Emitir ante DIAN
   const response = await woClient.post(`/invoices/${invoiceId}/emit-dian`, {...});
   ```

**Necesito de ti:**
- ✏️ Documentación de la API de World Office
- ✏️ Endpoints exactos para cada operación
- ✏️ Estructura de requests y responses
- ✏️ Credenciales de autenticación

#### 3.2 Strapi Service

Archivo: [src/services/strapiService.js](src/services/strapiService.js)

**Funciones a implementar:**

1. `saveSale()` - Línea 35
   ```javascript
   const response = await strapiClient.post('/api/sales', {
     data: {...}
   });
   ```

**Necesito de ti:**
- ✏️ URL de tu instancia de Strapi
- ✏️ API Token de Strapi
- ✏️ Estructura del content-type "sales"

#### 3.3 Callbell Service

Archivo: [src/services/callbellService.js](src/services/callbellService.js)

**Funciones a implementar:**

1. `notifyPaymentReceived()` - Línea 33
   ```javascript
   const response = await callbellClient.post('/messages/send', {
     phone: notificationData.phone,
     message: message,
     channel: 'whatsapp'
   });
   ```

**Necesito de ti:**
- ✏️ API Key de Callbell
- ✏️ Confirmar endpoint de envío de mensajes
- ✏️ Formato del teléfono (¿con o sin +57?)

---

### Paso 4: Próxima Sesión - Refactorizar webhookProcessor

Una vez tengas las credenciales y documentación, en la siguiente sesión:

1. ✅ Refactorizaremos `webhookProcessor.js` para usar los 10 pasos
2. ✅ Implementaremos el sistema de recuperación por stage
3. ✅ Actualizaremos los endpoints de consulta
4. ✅ Haremos testing end-to-end

---

## 📊 Tracking de Stages

Con los nuevos campos en la tabla `webhooks`:

### Consultar webhooks por stage:

```bash
# Webhooks atascados en World Office customer
GET /api/webhooks?current_stage=worldoffice_customer&status=processing

# Webhooks con error en DIAN
GET /api/webhooks?current_stage=worldoffice_dian&status=error

# Ver último stage exitoso
GET /api/webhooks/42
# Response incluirá:
{
  "current_stage": "worldoffice_dian",
  "last_completed_stage": "worldoffice_accounting"
}
```

### Reprocesar desde último stage:

```bash
POST /api/webhooks/42/reprocess
# → Automáticamente retoma desde worldoffice_dian
```

---

## ✅ Checklist de Implementación

### Base de Datos
- [ ] Ejecutar migración `add_stage_tracking.sql`
- [ ] Verificar que los índices se crearon correctamente
- [ ] Validar que webhooks existentes se actualizaron

### Configuración
- [ ] Agregar variables de World Office a `.env`
- [ ] Agregar variables de Strapi a `.env`
- [ ] Agregar variables de Callbell a `.env`
- [ ] Configurar variables en Render (producción)

### APIs - World Office
- [ ] Obtener documentación de API
- [ ] Implementar `findOrUpdateCustomer()`
- [ ] Implementar `createInvoice()`
- [ ] Implementar `accountInvoice()`
- [ ] Implementar `emitDianInvoice()`
- [ ] Probar cada función individualmente

### APIs - Strapi
- [ ] Configurar content-type "sales" en Strapi
- [ ] Obtener API Token
- [ ] Implementar `saveSale()`
- [ ] Probar guardado

### APIs - Callbell
- [ ] Obtener API Key
- [ ] Implementar `notifyPaymentReceived()`
- [ ] Probar envío de mensaje

### Procesador
- [ ] Refactorizar `webhookProcessor.js`
- [ ] Implementar logging por stage
- [ ] Implementar actualización de `current_stage` y `last_completed_stage`
- [ ] Implementar recuperación por stage

### Endpoints
- [ ] Agregar filtro por `current_stage` en `listWebhooks()`
- [ ] Agregar filtro por `last_completed_stage`
- [ ] Actualizar respuestas para incluir stages

### Testing
- [ ] Probar flujo completo end-to-end
- [ ] Probar recuperación de errores
- [ ] Probar reprocesamiento por stage
- [ ] Validar logs en cada paso

---

## 📞 Información que Necesito de Ti

Por favor, proporcióname:

### 1. World Office
```
API URL: ________________
API Token/Key: ________________
Username (si aplica): ________________
Password (si aplica): ________________
Link a documentación: ________________
```

### 2. Strapi
```
API URL: ________________
API Token: ________________
Content-type "sales" ya existe? ☐ Sí ☐ No
```

### 3. Callbell
```
API URL: https://api.callbell.eu/v1 (¿correcto?)
API Key: ________________
Formato de teléfono: ☐ +573001234567 ☐ 3001234567
```

---

## 🎯 Ventajas del Nuevo Sistema

1. ✅ **Experiencia del cliente primero**: Membresías y notificación instantáneas
2. ✅ **Facturación no bloquea**: Si falla, el cliente ya tiene sus beneficios
3. ✅ **Recuperación granular**: Puedes reprocesar desde cualquier paso
4. ✅ **Monitoreo detallado**: Sabes exactamente dónde está cada webhook
5. ✅ **Consultas optimizadas**: Puedes filtrar webhooks atascados en un stage específico
6. ✅ **Logs completos**: Cada paso registrado en base de datos y Render logs

---

## 📚 Documentos Relacionados

- [FLUJO_PROCESAMIENTO.md](FLUJO_PROCESAMIENTO.md) - Arquitectura completa del flujo
- [API_ENDPOINTS.md](API_ENDPOINTS.md) - Documentación de endpoints
- [SEGURIDAD.md](SEGURIDAD.md) - Configuración de seguridad
- [migrations/add_stage_tracking.sql](migrations/add_stage_tracking.sql) - Migración SQL

---

**Siguiente paso:** Comparte las credenciales y documentación de las APIs, y continuamos con la implementación! 🚀
