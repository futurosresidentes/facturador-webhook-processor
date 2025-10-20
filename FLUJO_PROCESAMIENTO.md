# 📋 Flujo de Procesamiento de Webhooks - 10 Pasos

## Estado Actual vs Nuevo Flujo

### ✅ Pasos Ya Implementados:

| Paso | Descripción | Estado | Servicio Actual |
|------|-------------|--------|-----------------|
| 1 | Extraer invoice ID (antes del guión) | ✅ Implementado | webhookProcessor.js:49 |
| 2 | Buscar invoice en FR360 y traer data | ✅ Implementado | fr360Service.js |
| 9 | Validar/crear contacto en CRM | ✅ Implementado | crmService.js |
| 10 | Validar promociones y crear membresías | ✅ Implementado | membershipService.js + utils/promotions.js |

### 🆕 Pasos Nuevos a Implementar:

| Paso | Descripción | Stage Name | Servicio a Crear |
|------|-------------|------------|------------------|
| 3 | Buscar/actualizar cliente en World Office | `worldoffice_customer` | worldOfficeService.js |
| 4 | Crear factura de venta | `worldoffice_invoice` | worldOfficeService.js |
| 5 | Contabilizar factura | `worldoffice_accounting` | worldOfficeService.js |
| 6 | Emitir factura ante DIAN | `worldoffice_dian` | worldOfficeService.js |
| 7 | Guardar venta en Strapi | `strapi_save` | strapiService.js |
| 8 | Notificar cliente vía Callbell | `callbell_notification` | callbellService.js |

---

## 🔄 Nuevo Flujo Completo (10 Pasos)

**🎯 PRIORIDAD: Experiencia del Cliente Primero**

```
Webhook Recibido (ePayco)
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 1: Extraer Invoice ID                                 │ ✅ Implementado
│ Stage: invoice_extraction                                   │
│ Service: webhookProcessor                                   │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 2: Consultar FR360                                    │ ✅ Implementado
│ Stage: fr360_query                                          │
│ Service: fr360Service                                       │
│ Output: paymentLinkData (email, cédula, producto, etc)     │
└─────────────────────────────────────────────────────────────┘
    ↓
    ┌─────────────────────────────────────────────────────────┐
    │           🎯 EXPERIENCIA DEL CLIENTE                    │
    │          (Primero lo crítico del usuario)               │
    └─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 3: Validar/Crear Contacto en CRM                      │ ✅ Implementado
│ Stage: crm_upsert                                           │
│ Service: crmService.findOrCreateContact()                  │
│ Output: contact, crmId                                      │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 4: Validar Promociones y Crear Membresías             │ ✅ Implementado
│ Stage: membership_creation                                  │
│ Service: membershipService.createMemberships()             │
│ Output: activationUrl, membershipIds                        │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 5: Notificar Cliente (Callbell)                       │ 🆕 Nuevo
│ Stage: callbell_notification                                │
│ Service: callbellService.notifyPaymentReceived()           │
│ - "Tu pago fue recibido"                                    │
│ - "Membresías activadas"                                    │
│ - Link de activación                                        │
│ Output: notificationSent                                    │
└─────────────────────────────────────────────────────────────┘
    ↓
    ┌─────────────────────────────────────────────────────────┐
    │              📄 FACTURACIÓN ELECTRÓNICA                 │
    │           (Procesos internos/contables)                 │
    └─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 6: Buscar/Actualizar Cliente en World Office          │ 🆕 Nuevo
│ Stage: worldoffice_customer                                 │
│ Service: worldOfficeService.findOrUpdateCustomer()         │
│ - Buscar por cédula                                         │
│ - Si existe: comparar y actualizar si es necesario          │
│ - Si NO existe: crear cliente                               │
│ Output: customerId, customerData                            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 7: Crear Factura de Venta                             │ 🆕 Nuevo
│ Stage: worldoffice_invoice                                  │
│ Service: worldOfficeService.createInvoice()                │
│ Output: invoiceNumber, invoiceId                            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 8: Contabilizar Factura                               │ 🆕 Nuevo
│ Stage: worldoffice_accounting                               │
│ Service: worldOfficeService.accountInvoice()               │
│ Output: accountingStatus                                    │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 9: Emitir Factura Electrónica (DIAN)                  │ 🆕 Nuevo
│ Stage: worldoffice_dian                                     │
│ Service: worldOfficeService.emitDianInvoice()              │
│ Output: cufe, dianStatus, pdfUrl                            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 10: Guardar en Strapi Facturación                     │ 🆕 Nuevo
│ Stage: strapi_save                                          │
│ Service: strapiService.saveSale()                           │
│ - Invoice data                                              │
│ - CUFE                                                      │
│ - PDF URL                                                   │
│ Output: strapiSaleId                                        │
└─────────────────────────────────────────────────────────────┘
    ↓
✅ COMPLETADO
```

**💡 Ventajas de este orden:**
- ✅ Cliente recibe acceso inmediato a membresías
- ✅ Cliente es notificado rápidamente
- ✅ Si la facturación falla, el cliente ya tiene sus beneficios
- ✅ Facturación es proceso interno que puede reintentar después

---

## 🗂️ Stages de Procesamiento

Cada webhook tendrá estos stages registrados en `webhook_logs`:

| # | Stage Name | Descripción | Status Posibles |
|---|------------|-------------|-----------------|
| 0 | `started` | Inicio del procesamiento | `processing` |
| 1 | `invoice_extraction` | Extracción del invoice ID | `success`, `failed` |
| 2 | `fr360_query` | Consulta a FR360 API | `success`, `failed` |
| 3 | `crm_upsert` | Crear/actualizar en CRM | `success`, `failed` |
| 4 | `membership_creation` | Crear membresías | `success`, `failed` |
| 5 | `callbell_notification` | Notificar vía Callbell | `success`, `failed` |
| 6 | `worldoffice_customer` | Buscar/crear cliente WO | `success`, `failed` |
| 7 | `worldoffice_invoice` | Crear factura en WO | `success`, `failed` |
| 8 | `worldoffice_accounting` | Contabilizar factura | `success`, `failed` |
| 9 | `worldoffice_dian` | Emitir factura DIAN | `success`, `failed` |
| 10 | `strapi_save` | Guardar en Strapi | `success`, `failed` |
| ✅ | `completed` | Proceso completado | `success` |
| ❌ | `error` | Error global | `failed` |

---

## 🛠️ Arquitectura de Servicios

### Servicios Existentes:
```
src/services/
├── webhookProcessor.js     ✅ Orquestador principal
├── fr360Service.js          ✅ Consultas a FR360
├── crmService.js            ✅ ActiveCampaign CRM
├── membershipService.js     ✅ Creación de membresías
└── notificationService.js   ✅ Google Chat notifications
```

### Servicios Nuevos a Crear:
```
src/services/
├── worldOfficeService.js    🆕 World Office (facturador)
│   ├── findOrUpdateCustomer()    - Paso 3
│   ├── createInvoice()           - Paso 4
│   ├── accountInvoice()          - Paso 5
│   └── emitDianInvoice()         - Paso 6
│
├── strapiService.js         🆕 Strapi facturación
│   └── saveSale()                - Paso 7
│
└── callbellService.js       🆕 Notificaciones Callbell
    └── notifyPaymentReceived()   - Paso 8
```

---

## 🔄 Sistema de Recuperación de Errores

### Consultar Webhooks Atascados en un Stage

```bash
# Ver webhooks atascados en World Office
GET /api/webhooks?status=processing&last_stage=worldoffice_customer

# Ver webhooks con error en DIAN
GET /api/webhooks?status=error&last_stage=worldoffice_dian
```

### Reprocesar desde un Stage Específico

Cuando reprocesas un webhook, el sistema:
1. Lee el último stage exitoso
2. Reanuda desde el siguiente stage
3. No repite pasos ya completados

```bash
# Reprocesar webhook que falló en DIAN
POST /api/webhooks/42/reprocess
# → Reanuda desde worldoffice_dian
```

---

## 📊 Nuevos Campos en la Tabla `webhooks`

Necesitamos agregar:
```sql
ALTER TABLE webhooks ADD COLUMN last_completed_stage VARCHAR(50);
ALTER TABLE webhooks ADD COLUMN current_stage VARCHAR(50);
```

Esto permite:
- Saber exactamente dónde está cada webhook
- Reanudar procesamiento desde el último paso exitoso
- Consultar webhooks atascados en un stage específico

---

## 🎯 Variables de Entorno Necesarias

```env
# World Office API
WORLDOFFICE_API_URL=https://...
WORLDOFFICE_API_KEY=...
WORLDOFFICE_USERNAME=...
WORLDOFFICE_PASSWORD=...

# Strapi Facturación
STRAPI_API_URL=https://...
STRAPI_API_TOKEN=...

# Callbell
CALLBELL_API_URL=https://...
CALLBELL_API_KEY=...
CALLBELL_WEBHOOK_ID=...
```

---

## ✅ Próximos Pasos

1. ✅ Confirmar arquitectura propuesta
2. 🔄 Actualizar modelo de base de datos (agregar campos `last_completed_stage`, `current_stage`)
3. 🔄 Crear servicios nuevos (worldOfficeService, strapiService, callbellService)
4. 🔄 Refactorizar webhookProcessor.js para usar el flujo de 10 pasos
5. 🔄 Implementar sistema de recuperación por stage
6. 🔄 Actualizar endpoints de consulta
7. 🔄 Agregar tests

---

## 🤔 Preguntas para Ti

Antes de implementar, necesito que me confirmes:

1. **¿La API de World Office tiene documentación?** ¿Tienes endpoints y credenciales?
2. **¿Strapi facturación es una instancia que ya tienes?** ¿URL y token?
3. **¿Callbell ya lo tienes configurado?** ¿API key disponible?
4. **¿El orden de los pasos es correcto?** ¿O prefieres otro orden?
5. **¿Quieres que los pasos 3-8 (facturación) se ejecuten ANTES del CRM y membresías?** O está bien al final?

Una vez confirmes estos detalles, procederé con la implementación.
