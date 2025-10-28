# Plan de Implementación de Checkpoints Completos

## Problema Actual

Solo 5 de 10 stages tienen implementada la lógica de **SKIP** (lectura de checkpoints):
- ✅ `invoice_extraction` - Tiene skip + checkpoint
- ✅ `fr360_query` - Tiene skip + checkpoint
- ✅ `callbell_notification` - Tiene skip + checkpoint
- ✅ `membership_creation` - Tiene skip + checkpoint
- ⚠️  `crm_management` - Tiene checkpoint PERO NO tiene skip
- ❌ `worldoffice_customer` - NO tiene skip ni checkpoint
- ❌ `worldoffice_invoice_creation` - NO tiene skip ni checkpoint
- ❌ `worldoffice_invoice_accounting` - NO tiene skip ni checkpoint
- ❌ `worldoffice_dian_emission` - NO tiene skip ni checkpoint
- ❌ `strapi_cartera_update` - NO tiene skip ni checkpoint
- ❌ `strapi_facturacion_creation` - NO tiene skip ni checkpoint

## Estrategia Simple y Segura

En lugar de modificar toda la estructura (riesgoso), vamos a:

1. **Agregar SOLO lógica de SKIP al inicio** de cada stage que no la tenga
2. **Agregar checkpoints** al final de stages exitosos que no los tengan
3. **NO modificar** el código existente de procesamiento

## Implementación por Stage

### 1. CRM Management (crm_management)

**YA TIENE:** `saveCheckpoint` en línea 516
**FALTA:** Skip logic

**Código a agregar ANTES de línea 406:**

```javascript
// STAGE 4: Registrar búsqueda/creación de contacto en CRM
let contact, crmAction;

if (isStageCompleted(webhook, 'crm_management')) {
  // Cargar desde checkpoint
  const stageData = getStageData(webhook, 'crm_management');
  contact = stageData.contact;
  crmAction = stageData.action;
  logger.info(`[Processor] ⏭️ SKIP crm_management - Cargado desde checkpoint: CRM ID ${contact.id}`);
  completedStages.crm = true;
} else {
  // Ejecutar stage normalmente (código existente sigue aquí)
  stepTimestamps.paso4 = Date.now();
  // ... resto del código hasta el saveCheckpoint
}
```

**Problema:** El código actual NO está envuelto en `else`, entonces:
- Necesitaríamos envolver TODO desde línea 407 hasta 537 en el `else`
- Esto es riesgoso y propenso a errores de sintaxis

**SOLUCIÓN ALTERNATIVA MÁS SEGURA:**
```javascript
// Al inicio del stage (línea 406)
if (isStageCompleted(webhook, 'crm_management')) {
  const stageData = getStageData(webhook, 'crm_management');
  contact = { id: stageData.contact.id };
  crmAction = stageData.action;
  logger.info(`[Processor] ⏭️ SKIP crm_management - Cargado desde checkpoint`);
  completedStages.crm = true;
  // Saltar al siguiente stage
  // (usar un flag o return temprano)
} else {
  // El código existente continúa normalmente
}
```

### 2. WorldOffice Customer (worldoffice_customer)

**YA TIENE:** Nada
**FALTA:** Skip logic + checkpoint

**Ubicación:** Línea ~542-559

**Código a agregar:**

```javascript
// STAGE 5: Buscar o crear cliente en World Office
let woCustomerResult;

if (isStageCompleted(webhook, 'worldoffice_customer')) {
  // Cargar desde checkpoint
  const stageData = getStageData(webhook, 'worldoffice_customer');
  woCustomerResult = {
    customerId: stageData.customerId,
    action: stageData.action,
    comercialWOId: stageData.comercialWOId,
    cityId: stageData.cityId
  };
  logger.info(`[Processor] ⏭️ SKIP worldoffice_customer - Cliente ID ${woCustomerResult.customerId}`);
  completedStages.worldoffice_customer = true;
} else {
  // Ejecutar stage
  stepTimestamps.paso5 = Date.now();
  logger.info(`[Processor] PASO 5: Gestionando cliente en World Office`);

  woCustomerResult = await worldOfficeService.findOrUpdateCustomer({
    // ...params
  });

  logger.info(`[Processor] Cliente WO: ${woCustomerResult.action} - ID ${woCustomerResult.customerId}`);
  completedStages.worldoffice_customer = true;

  // ... LOG PASO 5 ...

  // CHECKPOINT: Guardar cliente
  await saveCheckpoint(webhook, 'worldoffice_customer', {
    customerId: woCustomerResult.customerId,
    action: woCustomerResult.action,
    comercialWOId: woCustomerResult.comercialWOId,
    cityId: woCustomerResult.cityId
  });
} // Fin del else
```

### 3. WorldOffice Invoice Creation (worldoffice_invoice_creation)

**⚠️ CRÍTICO** - Este es el que causó la duplicación de facturas

**Ubicación:** Línea ~625-750

**Código a agregar con VALIDACIÓN DE DUPLICADOS:**

```javascript
// PASO 6A: Crear factura
let invoiceResult;

if (isStageCompleted(webhook, 'worldoffice_invoice_creation')) {
  // Cargar desde checkpoint
  const stageData = getStageData(webhook, 'worldoffice_invoice_creation');
  invoiceResult = {
    documentoId: stageData.documentoId,
    numeroFactura: stageData.numeroFactura,
    renglones: stageData.renglones
  };
  logger.info(`[Processor] ⏭️ SKIP worldoffice_invoice_creation - Factura ${invoiceResult.numeroFactura}`);
  completedStages.worldoffice_invoice = true;
} else {
  stepTimestamps.paso6a = Date.now();

  try {
    // ⚠️ VALIDACIÓN DE DUPLICADOS (NUEVO)
    const existingInvoice = await worldOfficeService.findInvoiceByReference(webhook.invoice_id);

    if (existingInvoice) {
      // Factura ya existe, usar la existente
      logger.warn(`[Processor] Factura ya existe para ${webhook.invoice_id}: ${existingInvoice.numeroFactura}`);
      invoiceResult = existingInvoice;
    } else {
      // Crear factura nueva
      invoiceResult = await worldOfficeService.createInvoice({
        customerId: woCustomerResult.customerId,
        comercialWOId: woCustomerResult.comercialWOId,
        product: paymentLinkData.product,
        amount: parseFloat(webhook.amount)
      });
    }

    completedStages.worldoffice_invoice = true;
    logger.info(`[Processor] Factura ${existingInvoice ? 'recuperada' : 'creada'} - Doc ID: ${invoiceResult.documentoId}`);

    // LOG PASO 6A...

    // CHECKPOINT: Guardar factura
    await saveCheckpoint(webhook, 'worldoffice_invoice_creation', {
      documentoId: invoiceResult.documentoId,
      numeroFactura: invoiceResult.numeroFactura,
      renglones: invoiceResult.renglones,
      amount: parseFloat(webhook.amount)
    });

  } catch (error) {
    // ... manejo de errores
  }
}
```

**NOTA:** Necesitamos implementar `findInvoiceByReference` en `worldOfficeService`

### 4. WorldOffice Invoice Accounting (worldoffice_invoice_accounting)

**Ubicación:** Línea ~775-820

```javascript
// PASO 6B: Contabilizar factura
let accountingResult;

if (isStageCompleted(webhook, 'worldoffice_invoice_accounting')) {
  const stageData = getStageData(webhook, 'worldoffice_invoice_accounting');
  accountingResult = {
    status: stageData.status,
    accountingDate: stageData.accountingDate
  };
  logger.info(`[Processor] ⏭️ SKIP worldoffice_invoice_accounting - Ya contabilizada`);
  completedStages.worldoffice_accounting = true;
} else {
  stepTimestamps.paso6b = Date.now();

  try {
    accountingResult = await worldOfficeService.accountInvoice(invoiceResult.documentoId);
    completedStages.worldoffice_accounting = true;
    logger.info(`[Processor] Factura contabilizada - Status: ${accountingResult.status}`);

    // LOG PASO 6B...

    // CHECKPOINT
    await saveCheckpoint(webhook, 'worldoffice_invoice_accounting', {
      documentoId: invoiceResult.documentoId,
      numeroFactura: invoiceResult.numeroFactura,
      status: accountingResult.status,
      accountingDate: accountingResult.accountingDate
    });

  } catch (error) {
    // ...
  }
}
```

### 5. WorldOffice DIAN Emission (worldoffice_dian_emission)

**Ubicación:** Línea ~825-900

```javascript
// PASO 6C: Emitir ante DIAN
let dianResult;

if (isStageCompleted(webhook, 'worldoffice_dian_emission')) {
  const stageData = getStageData(webhook, 'worldoffice_dian_emission');
  dianResult = stageData.dianResult || { skipped: true };
  logger.info(`[Processor] ⏭️ SKIP worldoffice_dian_emission - ${dianResult.skipped ? 'Omitida' : 'Ya emitida'}`);
} else {
  stepTimestamps.paso6c = Date.now();

  try {
    dianResult = await worldOfficeService.emitDianInvoice(invoiceResult.documentoId);

    if (dianResult.skipped) {
      logger.info(`[Processor] Emisión DIAN omitida (desactivada)`);
      // LOG...
    } else if (dianResult.warning) {
      // LOG warning...
    } else {
      // LOG success...
    }

    // CHECKPOINT
    await saveCheckpoint(webhook, 'worldoffice_dian_emission', {
      documentoId: invoiceResult.documentoId,
      dianResult: dianResult
    });

  } catch (error) {
    // ...
  }
}
```

### 6. Strapi Cartera Update (strapi_cartera_update)

**Ubicación:** Línea ~950-1000

```javascript
// STAGE 7: Actualizar cartera en Strapi
let carteraResult;

if (isStageCompleted(webhook, 'strapi_cartera_update')) {
  const stageData = getStageData(webhook, 'strapi_cartera_update');
  carteraResult = stageData.carteraResult;
  logger.info(`[Processor] ⏭️ SKIP strapi_cartera_update - Ya actualizada`);
} else {
  stepTimestamps.paso7 = Date.now();

  carteraResult = await strapiCarteraService.updateCartera({
    acuerdoId: paymentLinkData.agreementId,
    amount: parseFloat(webhook.amount),
    fecha: toColombiaISO(new Date())
  });

  logger.info(`[Processor] Cartera actualizada - Acuerdo: ${paymentLinkData.agreementId}`);

  // LOG...

  // CHECKPOINT
  await saveCheckpoint(webhook, 'strapi_cartera_update', {
    acuerdoId: paymentLinkData.agreementId,
    amount: parseFloat(webhook.amount),
    carteraResult: carteraResult
  });
}
```

### 7. Strapi Facturación Creation (strapi_facturacion_creation)

**⚠️ CRÍTICO** - Este también se duplicó

**Ubicación:** Línea ~1000-1050

```javascript
// STAGE 8: Crear registro de facturación en Strapi
let facturacionResult;

if (isStageCompleted(webhook, 'strapi_facturacion_creation')) {
  const stageData = getStageData(webhook, 'strapi_facturacion_creation');
  facturacionResult = stageData.facturacionResult;
  logger.info(`[Processor] ⏭️ SKIP strapi_facturacion_creation - ID ${facturacionResult.id}`);
} else {
  stepTimestamps.paso8 = Date.now();

  // ⚠️ USAR UPSERT EN LUGAR DE CREATE (idempotencia)
  facturacionResult = await strapiCache.createFacturacion({
    acuerdo: paymentLinkData.agreementId,
    fecha: toColombiaISO(new Date()),
    monto: parseFloat(webhook.amount),
    // ... otros campos
    // AGREGAR: where clause para upsert
    upsertBy: {
      acuerdo: paymentLinkData.agreementId,
      fecha: toColombiaISO(new Date())
    }
  });

  logger.info(`[Processor] Facturación registrada en Strapi - ID: ${facturacionResult.id}`);

  // LOG...

  // CHECKPOINT
  await saveCheckpoint(webhook, 'strapi_facturacion_creation', {
    facturacionId: facturacionResult.id,
    acuerdo: paymentLinkData.agreementId,
    facturacionResult: facturacionResult
  });
}
```

## Cambios Adicionales Necesarios

### worldOfficeService.js

Agregar función para buscar facturas existentes:

```javascript
/**
 * Busca una factura por referencia de invoice_id
 * @param {string} invoiceRef - Referencia del invoice (ej: "5541496900e88a8a901-1761621501492")
 * @returns {Object|null} Factura encontrada o null
 */
async function findInvoiceByReference(invoiceRef) {
  try {
    // Extraer solo la parte antes del guión
    const invoiceId = invoiceRef.split('-')[0];

    // Buscar en WorldOffice por observaciones o campo personalizado
    // (Asumiendo que el invoice_id se guarda en algún campo)
    const response = await axios.get(`${API_URL}/documentos`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` },
      params: {
        observaciones: invoiceId  // O el campo donde se guarde
      }
    });

    if (response.data && response.data.length > 0) {
      return {
        documentoId: response.data[0].id,
        numeroFactura: response.data[0].numero,
        // ... otros campos necesarios
      };
    }

    return null;
  } catch (error) {
    logger.warn(`[WorldOffice] Error buscando factura por ref ${invoiceRef}: ${error.message}`);
    return null;
  }
}

module.exports = {
  // ... exports existentes
  findInvoiceByReference
};
```

### strapiCache.js

Modificar `createFacturacion` para usar upsert:

```javascript
async function createFacturacion(data) {
  const { upsertBy, ...facturacionData } = data;

  if (upsertBy) {
    // Buscar existente
    const existing = await strapi.find('facturacions', {
      filters: upsertBy
    });

    if (existing.data && existing.data.length > 0) {
      // Ya existe, retornar el existente
      logger.info(`[Strapi] Facturación ya existe: ${existing.data[0].id}`);
      return existing.data[0];
    }
  }

  // Crear nuevo
  const result = await strapi.create('facturacions', { data: facturacionData });
  return result.data;
}
```

## Testing del Sistema Completo

### Test 1: Webhook Nuevo (Sin Checkpoints)

```bash
# Crear webhook de prueba
curl -X POST "http://localhost:3000/api/webhooks" \
  -H "Content-Type: application/json" \
  -d '{ ... datos de prueba ... }'

# Verificar que se ejecuten TODOS los stages
# Verificar que se guarden TODOS los checkpoints
```

### Test 2: Retry de Webhook Completado

```bash
# Hacer retry de webhook que ya completó
POST /api/webhooks/:id/retry
{ "force_restart": false }

# Verificar que:
# - Todos los stages muestren "⏭️ SKIP"
# - No se duplique NADA (facturas, registros, WhatsApp)
# - Webhook se marque como completed inmediatamente
```

### Test 3: Retry de Webhook Fallido

```bash
# Hacer fallar un webhook en stage específico (ej: worldoffice_invoice_creation)
# Hacer retry

# Verificar que:
# - Stages anteriores se salten (SKIP)
# - Stage fallido se ejecute
# - Stages posteriores se ejecuten
# - Todo se complete exitosamente
```

## Orden de Implementación Recomendado

1. ✅ **Primero:** worldoffice_invoice_creation (CRÍTICO - previene duplicación de facturas)
2. ✅ **Segundo:** strapi_facturacion_creation (CRÍTICO - previene duplicación de registros)
3. ✅ **Tercero:** crm_management (ya tiene checkpoint, solo falta skip)
4. ✅ **Cuarto:** worldoffice_customer
5. ✅ **Quinto:** worldoffice_invoice_accounting
6. ✅ **Sexto:** worldoffice_dian_emission
7. ✅ **Séptimo:** strapi_cartera_update

## Decisión

¿Quieres que:
- **A)** Implemente TODO esto automáticamente (riesgoso pero completo)
- **B)** Hagamos solo los 2 CRÍTICOS primero y testeamos (más seguro)
- **C)** Te genere los patches/diffs exactos para que revises antes de aplicar

**MI RECOMENDACIÓN:** Opción B - hacer solo los críticos, testear, y luego continuar.
