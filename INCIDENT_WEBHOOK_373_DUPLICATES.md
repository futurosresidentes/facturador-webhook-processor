# 🚨 INCIDENTE: Duplicación de Facturas - Webhook 373

## Fecha del Incidente
**2025-10-28 17:10 UTC** (Segundo retry del webhook 373)

## Resumen Ejecutivo
El sistema de checkpoints implementado estaba **incompleto**, causando duplicación de facturas y registros al hacer retry de un webhook ya completado.

## Causa Raíz
Solo 4 de 10 stages tenían implementado el sistema de checkpoints:
- ✅ `invoice_extraction`
- ✅ `fr360_query`
- ✅ `callbell_notification`
- ✅ `membership_creation`

**Faltaban checkpoints en:**
- ❌ `crm_management`
- ❌ `worldoffice_customer`
- ❌ `worldoffice_invoice_creation` ⚠️ CRÍTICO
- ❌ `worldoffice_invoice_accounting`
- ❌ `strapi_cartera_update`
- ❌ `strapi_facturacion_creation` ⚠️ CRÍTICO

## Impacto - Webhook 373

### Cliente Afectado
- **Nombre:** Nelson Andres Valderrama Mendoza
- **Email:** navalderrama1216@gmail.com
- **Cédula:** 1098679522
- **Teléfono:** 573177024748
- **Producto:** Curso Intensivo UDEA 2026 - Cuota 1
- **Monto:** $403.125 COP

### Timeline de Eventos

```
2025-10-28 03:21:20 UTC - Webhook 373 recibido
2025-10-28 03:21:28 UTC - Falló en stage crm_upsert (error case-sensitivity)
                           Completados: invoice_extraction, fr360_query,
                                       callbell_notification, membership_creation

2025-10-28 15:58:00 UTC - PRIMER RETRY (exitoso)
                           Saltó stages 1-4 (tenían checkpoint)
                           Ejecutó: CRM, WorldOffice, Strapi
                           Creó: Factura 25290, Registro Strapi 25264

2025-10-28 17:10:00 UTC - SEGUNDO RETRY (duplicó todo) ❌
                           Saltó stages 1-4 (tenían checkpoint)
                           RE-EJECUTÓ: CRM, WorldOffice, Strapi
                           Creó: Factura 25292 (DUPLICADA), Registro Strapi 25266 (DUPLICADO)
```

### Duplicaciones Generadas

#### 1. WorldOffice - Facturas
- **Factura Válida:** Nro: 25290, Doc ID: 21233 (2025-10-28 15:58:13)
- **Factura Duplicada:** Nro: 25292, Doc ID: 21236 (2025-10-28 17:10:20) ❌

#### 2. Strapi - Registros de Facturación
- **Registro Válido:** ID: 25264 (2025-10-28 15:58:24)
- **Registro Duplicado:** ID: 25266 (2025-10-28 17:10:26) ❌

#### 3. Strapi - Cartera
- Actualizado 2 veces (contabilizó el pago dos veces)

#### 4. CRM (Clientify)
- Contacto actualizado 2 veces (probablemente sin impacto mayor)

### Lo que NO se Duplicó ✅
- WhatsApp: Solo 1 mensaje enviado (tenía checkpoint)
- Membresías: Solo 1 membresía creada (tenía checkpoint)
- FR360 Query: Solo 1 consulta (tenía checkpoint)

## Procedimiento de Limpieza

### 1. WorldOffice - Anular Factura Duplicada

```sql
-- Conectar a WorldOffice
-- Anular factura 25292 (Doc ID: 21236)

-- OPCIÓN A: Anular desde la interfaz web de WorldOffice
-- 1. Ir a Facturación > Buscar factura 25292
-- 2. Click en "Anular factura"
-- 3. Motivo: "Factura duplicada por error de sistema - mantener factura 25290"

-- OPCIÓN B: Si hay API de anulación
POST /api/invoices/21236/void
{
  "reason": "Duplicate - keep invoice 25290",
  "cancelled_by": "system"
}
```

### 2. Strapi - Eliminar Registro Duplicado

```javascript
// Eliminar registro de facturación 25266
DELETE /api/facturacions/25266

// O mediante Strapi Admin Panel:
// 1. Ir a Content Manager > Facturación
// 2. Buscar ID: 25266
// 3. Verificar que es el duplicado (fecha: 2025-10-28 17:10:26)
// 4. Eliminar registro
```

### 3. Strapi - Corregir Cartera

```javascript
// Obtener estado actual de cartera
GET /api/carteras?filters[acuerdo][$eq]=25102764360103

// Si la cartera cuenta el pago 2 veces, ajustar manualmente:
// Restar $403.125 del total pagado
// O recalcular desde los pagos reales
```

### 4. Verificar CRM (Clientify)

```javascript
// Verificar contacto
GET /api/contacts?email=navalderrama1216@gmail.com

// No debería requerir cambios - solo se actualizó 2 veces con los mismos datos
```

## Medidas Correctivas Implementadas

### Inmediatas
1. ✅ **Endpoint de retry DESHABILITADO** (status 503)
2. ✅ Mensaje de error claro explicando el riesgo
3. ✅ Documentación del incidente creada

### Pendientes
1. ⏳ Agregar checkpoints a los 6 stages faltantes
2. ⏳ Implementar validación de duplicados en WorldOffice antes de crear factura
3. ⏳ Implementar idempotencia en Strapi (upsert en lugar de create)
4. ⏳ Testing exhaustivo con webhook de prueba
5. ⏳ Re-habilitar endpoint de retry

## Prevención Futura

### 1. Checkpoints Completos
Todos los stages deben tener:
```javascript
if (isStageCompleted(webhook, 'stage_name')) {
  const stageData = getStageData(webhook, 'stage_name');
  // Usar datos cacheados
} else {
  // Ejecutar stage
  await saveCheckpoint(webhook, 'stage_name', { data });
}
```

### 2. Validación de Duplicados (Idempotencia)
```javascript
// Antes de crear factura en WorldOffice
const existingInvoice = await worldOffice.findInvoiceByReference(webhook.invoice_id);
if (existingInvoice) {
  logger.warn(`Factura ya existe: ${existingInvoice.numero}`);
  return existingInvoice; // No crear duplicada
}
```

### 3. Testing de Retry
```javascript
// Crear webhook de prueba
// Hacerlo fallar en cada stage
// Verificar que retry no duplica
// Verificar que retry completa correctamente
```

### 4. Monitoring
- Alert si un webhook tiene `retry_count > 1`
- Dashboard mostrando webhooks con múltiples retries
- Log de todas las operaciones críticas (crear factura, registrar pago)

## Contacto y Notificaciones

### Personas a Notificar
- [ ] **Contabilidad:** Factura duplicada 25292 debe ser anulada
- [ ] **Administrador Strapi:** Eliminar registro 25266
- [ ] **Equipo Técnico:** Sistema de retry deshabilitado

### Cliente Afectado
- **Notificar:** ❓ A evaluar (probablemente no, si se limpia correctamente)
- **Impacto visible:** Ninguno si se anula la factura duplicada antes de enviarla

## Estado Actual

- **Retry Endpoint:** 🔴 DESHABILITADO (503)
- **Webhook 373:** ⚠️ Completado pero con duplicados
- **Limpieza:** ⏳ Pendiente (requiere acceso a WorldOffice y Strapi)
- **Fix Checkpoints:** ⏳ Pendiente

## Lecciones Aprendidas

1. ❌ **No lanzar features a medias:** El sistema de checkpoints solo estaba implementado en 40% de los stages
2. ❌ **Testing insuficiente:** No se probó hacer retry de un webhook ya completado
3. ❌ **Falta de idempotencia:** Los stages de facturación no validan duplicados
4. ✅ **Buen diseño base:** El sistema de checkpoints funcionó donde estaba implementado
5. ✅ **Clasificación de errores:** El sistema identificó correctamente errores retriables

## Próximos Pasos

1. **Inmediato:** Limpiar duplicados del webhook 373
2. **Corto plazo:** Implementar checkpoints completos
3. **Mediano plazo:** Agregar idempotencia a todos los stages críticos
4. **Largo plazo:** Sistema de testing automatizado de retry

---

**Documento creado:** 2025-10-28
**Última actualización:** 2025-10-28
**Responsable:** Sistema de webhooks
**Severidad:** Alta (duplicación de facturas en producción)
