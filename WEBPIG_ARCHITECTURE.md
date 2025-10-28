# Web Pig 🐷 - Arquitectura y Documentación Técnica

## Índice
1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Estructura de Datos Actual](#estructura-de-datos-actual)
4. [Flujo de Procesamiento](#flujo-de-procesamiento)
5. [Componentes Frontend](#componentes-frontend)
6. [Componentes Backend](#componentes-backend)
7. [Sistema de Feature Flags](#sistema-de-feature-flags)
8. [Problemas Actuales y Oportunidades de Mejora](#problemas-actuales-y-oportunidades-de-mejora)

---

## Visión General

**Web Pig** es un sistema de monitoreo en tiempo real para webhooks de transacciones de pagos. Permite visualizar el estado de procesamiento de cada transacción a través de múltiples stages (etapas) y controlar qué funcionalidades están activas mediante feature flags.

### Propósito Principal
- Monitorear transacciones de pago en tiempo real
- Visualizar el estado de cada stage del procesamiento
- Controlar qué stages se ejecutan mediante feature flags
- Debuggear errores en el flujo de procesamiento

### Ubicación en la Aplicación
- **Tab**: "Web Pig 🐷" en la barra de navegación superior
- **Ruta**: `/` (home) con tab `webpig`
- **Acceso**: Solo usuarios autenticados con dominio @sentiretaller.com

---

## Arquitectura del Sistema

### Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────┐
│                    Sistema Externo (Facturador)              │
│  - Recibe webhooks de pagos                                  │
│  - Procesa stages secuencialmente                            │
│  - Almacena logs en MongoDB                                  │
│  - Expone API REST con webhooks recientes                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ API REST (Bearer Token)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   FR360 Backend (index.js)                   │
│  - Proxy endpoints para seguridad                            │
│  - Validación de autenticación                               │
│  - GET /api/webpig/webhooks                                  │
│  - GET /api/webpig/feature-flags                             │
│  - POST /api/webpig/feature-flags/:flagKey                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Fetch API
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              FR360 Frontend (webpig.js)                      │
│  - Renderiza tabla de transacciones                          │
│  - Muestra íconos de estado por stage                        │
│  - Modal de detalles de logs                                 │
│  - Toggles de feature flags                                  │
└───────────────────────────────────────────────────────────────┘
```

### Stack Tecnológico

**Backend (FR360):**
- Node.js + Express
- Proxy endpoints con autenticación
- Bearer token para API externa

**Frontend (FR360):**
- JavaScript Vanilla (ES6+)
- Fetch API para comunicación
- EJS templates para HTML
- CSS custom para estilos

**Sistema Externo (Facturador):**
- API REST (probablemente Node.js)
- MongoDB para almacenamiento
- Feature Flags en DB o memoria

---

## Estructura de Datos Actual

### Webhook Object (Como llega de la API)

```javascript
{
  "id": 123,                           // ID único del webhook
  "invoice_id": "INV-20250127-001",    // ID de la factura (puede estar en logs)
  "response": "Aceptada",              // Estado: "Aceptada" o "Rechazada"

  // Información del cliente (PUEDE ESTAR INCOMPLETA)
  "customer": {
    "name": "Juan Pérez",              // Puede faltar
    "email": "juan@example.com"        // Puede faltar
  },

  // Datos raw del webhook original
  "raw_data": {
    "x_customer_movil": "3001234567",  // Teléfono sin código país
    // ... otros campos del webhook original
  },

  // Producto (puede estar incompleto)
  "product": "Membresía Elite",        // Puede faltar

  // TODA LA INFORMACIÓN IMPORTANTE ESTÁ EN LOGS
  "logs": {
    "all": [
      {
        "stage": "invoice_extraction",
        "status": "success",           // success | error | info | processing
        "details": "Invoice ID extraído: INV-20250127-001",
        "created_at": "2025-01-27T15:30:00.000Z",
        "request_payload": { /* ... */ },
        "response_data": { /* ... */ },
        "error_message": null
      },
      {
        "stage": "fr360_query",
        "status": "success",
        "details": "Cliente: Juan Pérez, Cédula: 1234567890, Producto: Membresía Elite",
        "created_at": "2025-01-27T15:30:01.000Z",
        "response_data": {
          "phone": "3001234567"        // Teléfono puede estar aquí
        }
      },
      {
        "stage": "membership_creation",
        "status": "success",
        "details": "Membresía creada exitosamente en FRAPP",
        "request_payload": { /* payload enviado */ },
        "response_data": { /* respuesta de FRAPP */ }
      },
      {
        "stage": "crm_upsert",
        "status": "success",
        "details": "Cliente sincronizado en CRM"
      },
      {
        "stage": "worldoffice_invoice_creation",
        "status": "error",
        "details": "Error al crear factura",
        "error_message": "Timeout after 30s"
      },
      {
        "stage": "worldoffice_dian_emission",
        "status": "info",
        "details": "Stage omitido",
        "response_data": {
          "skipped": true,
          "reason": "WORLDOFFICE_DIAN_ENABLED=false"
        }
      }
      // ... más stages
    ]
  }
}
```

### Stages Actuales (STAGE_COLUMNS mapping)

```javascript
const STAGE_COLUMNS = {
  // Stage Name              → Column Name (UI)
  'membership_creation':       'FRAPP',
  'crm_management':            'CRM',
  'crm_upsert':                'CRM',
  'worldoffice_customer':      'WO',
  'worldoffice_invoice_creation': 'Factura',
  'worldoffice_invoice_accounting': 'Factura',
  'worldoffice_dian_emission': 'DIAN',
  'strapi_cartera_update':     'Cartera',
  'strapi_facturacion_creation': 'Ventas'
};
```

**Mapeo Visual:**
- Múltiples stages pueden mapear a la misma columna
- Si algún stage de una columna tiene error, toda la columna muestra ⛔
- Si algún stage fue skipped (feature flag), muestra ⚠️

### Estados de Logs

```javascript
{
  status: 'success',  // ✅ Stage completado exitosamente
  status: 'error',    // ⛔ Stage falló con error
  status: 'info',     // ✅ Información (tratado como éxito)
  status: 'processing' // ⏳ Stage en proceso
}
```

### Feature Flags Skipped

Cuando un stage es omitido por feature flag:
```javascript
{
  status: 'info',  // o cualquier otro
  response_data: {
    skipped: true,
    reason: "MEMBERSHIPS_ENABLED=false" // o "feature flag disabled"
  }
}
```

---

## Flujo de Procesamiento

### 1. Carga Inicial

```
Usuario hace click en tab "Web Pig 🐷"
  ↓
Se ejecuta loadFeatureFlags() (automático)
  ↓
Si container está vacío → loadWebhooks() (automático)
```

### 2. Obtención de Webhooks

```javascript
// Frontend: webpig.js
fetchWebhooks()
  ↓
  GET /api/webpig/webhooks (FR360 Backend)
    ↓
    GET {FACTURADOR_WEBHOOK_BASE_URL}/api/webhooks/recent
    Bearer {FACTURADOR_WEBHOOK_BEARER_TOKEN}
      ↓
      Retorna: { success: true, webhooks: [...] }
```

### 3. Renderizado de Tabla

Para cada webhook:

```javascript
// 1. Extraer información (PROBLEMA ACTUAL: parsing de strings)
const invoiceId = extractInvoiceId(webhook);  // Busca en logs.all → stage: 'invoice_extraction'
const customer = extractCustomer(webhook);     // Busca en logs.all → stage: 'fr360_query'
const cedula = extractCedula(webhook);         // Regex en details: "Cédula: 1234567890"
const product = extractProduct(webhook);       // Regex en details: "Producto: XXX"
const phone = extractPhone(webhook);           // De response_data o raw_data

// 2. Determinar estado general
const isAccepted = webhook.response === 'Aceptada';

// 3. Calcular estado por columna
const frappStatus = getStageStatus(webhook, 'FRAPP', isAccepted);
const crmStatus = getStageStatus(webhook, 'CRM', isAccepted);
// ... etc para cada columna

// 4. Renderizar fila con íconos
row.innerHTML = `
  <td>${webhook.id}</td>
  <td>${customer}<br>CC ${cedula}<br>${email}<br>${phone}</td>
  <td>${product}</td>
  <td>${isAccepted ? '✅' : '🚫'}</td>
  <td>${frappStatus.icon}</td>
  <td>${crmStatus.icon}</td>
  <!-- ... más columnas -->
`;
```

### 4. Lógica de getStageStatus()

```javascript
function getStageStatus(webhook, columnName, isAccepted) {
  // Si transacción rechazada → no mostrar stages
  if (!isAccepted) {
    return { status: 'not-applicable', icon: '-', logs: [] };
  }

  // Encontrar stages relevantes para esta columna
  const relevantStages = ['membership_creation']; // ejemplo para FRAPP

  // Filtrar logs de esos stages
  const logs = webhook.logs.all.filter(log =>
    relevantStages.includes(log.stage)
  );

  // Si no hay logs → no se ejecutó
  if (logs.length === 0) {
    return { status: 'not-run', icon: '⛔', logs: [] };
  }

  // Chequear estados (prioridad: skipped > error > success > info > processing)
  const hasSkipped = logs.some(/* ... */);
  const hasError = logs.some(log => log.status === 'error');
  const hasSuccess = logs.some(log => log.status === 'success');
  const hasProcessing = logs.some(log => log.status === 'processing');

  if (hasSkipped) return { status: 'skipped', icon: '⚠️', logs };
  if (hasError) return { status: 'error', icon: '⛔', logs };
  if (hasSuccess) return { status: 'success', icon: '✅', logs };
  if (hasProcessing) return { status: 'pending', icon: '⏳', logs };

  return { status: 'not-run', icon: '⛔', logs };
}
```

### 5. Interacción con Stages

```
Usuario hace click en un ícono de stage (ej: ✅ en columna FRAPP)
  ↓
Se obtiene el row dataset (JSON con todos los status)
  ↓
Se extrae stageData[columnName].logs
  ↓
Se abre modal showStageDetails() con:
  - Lista de logs de ese stage
  - Timestamps
  - Details
  - Request Payload (JSON)
  - Response Data (JSON)
  - Error Messages
```

### 6. Feature Flags

```
Usuario hace toggle de un flag (ej: "Crear membresías")
  ↓
handleFlagToggle() valida permisos
  ↓
POST /api/webpig/feature-flags/MEMBERSHIPS_ENABLED
  body: { value: true/false }
    ↓
    PUT {FACTURADOR_WEBHOOK_BASE_URL}/api/feature-flags/MEMBERSHIPS_ENABLED
    Bearer {FACTURADOR_FEATURE_FLAGS_BEARER_TOKEN}
      ↓
      Sistema externo actualiza flag
      ↓
      Próximos webhooks respetan el nuevo valor
```

---

## Componentes Frontend

### Archivo: `public/js/webpig.js`

#### Constantes Globales

```javascript
const WEBPIG_API_URL = '/api/webpig/webhooks';
const WEBPIG_FEATURE_FLAGS_URL = '/api/webpig/feature-flags';

const FLAG_PERMISSIONS = {
  'MEMBERSHIPS_ENABLED': ['daniel.cardona@sentiretaller.com'],
  'WORLDOFFICE_INVOICE_ENABLED': ['daniel.cardona@...', 'yicela.agudelo@...', 'ana.quintero@...'],
  'WORLDOFFICE_DIAN_ENABLED': ['daniel.cardona@...', 'yicela.agudelo@...', 'ana.quintero@...']
};

const STAGE_COLUMNS = {
  'membership_creation': 'FRAPP',
  'crm_management': 'CRM',
  'crm_upsert': 'CRM',
  'worldoffice_customer': 'WO',
  'worldoffice_invoice_creation': 'Factura',
  'worldoffice_invoice_accounting': 'Factura',
  'worldoffice_dian_emission': 'DIAN',
  'strapi_cartera_update': 'Cartera',
  'strapi_facturacion_creation': 'Ventas'
};
```

#### Funciones Principales

**fetchWebhooks()** - Obtiene webhooks desde API
**fetchFeatureFlags()** - Obtiene feature flags
**updateFeatureFlag(flagKey, value)** - Actualiza un flag

**extractInvoiceId(webhook)** - Extrae invoice ID de logs
**extractCustomer(webhook)** - Extrae nombre cliente de logs
**extractCedula(webhook)** - Extrae cédula con regex
**extractProduct(webhook)** - Extrae producto con regex
**extractPhone(webhook)** - Extrae teléfono (múltiples fuentes)

**isTransactionAccepted(webhook)** - Verifica si respuesta es "Aceptada"
**getStageStatus(webhook, columnName, isAccepted)** - Calcula estado de columna
**formatDate(dateString)** - Formatea fecha a formato colombiano

**showStageDetails(columnName, logs, webhookData)** - Muestra modal con detalles
**closeStageDetails()** - Cierra modal

**renderWebhooks(webhooks)** - Renderiza tabla principal
**renderFeatureFlags(flags)** - Renderiza toggles de feature flags

**loadWebhooks()** - Carga y renderiza webhooks
**loadFeatureFlags()** - Carga y renderiza feature flags
**initWebPig()** - Inicializa todo el módulo

#### Problemas en el Código Actual

1. **Parsing de Strings con Regex** ❌
```javascript
// Línea 108: Busca "Invoice ID extraído: XXX" en details string
const match = extractionLog.details.match(/Invoice ID extraído:\s*(\S+)/);

// Línea 122: Busca "Cliente: XXX" en details string
const match = fr360Log.details.match(/Cliente:\s*([^,]+)/);

// Línea 136: Busca "Cédula: 123456" en details string
const match = fr360Log.details.match(/Cédula:\s*(\d+)/);

// Línea 150: Busca "Producto: XXX" en details string
const match = fr360Log.details.match(/Producto:\s*([^,]+)/);
```

**Problema:** Depende del formato exacto del string. Si el sistema externo cambia el mensaje, se rompe.

2. **Información Dispersa** ❌
```javascript
// Teléfono puede estar en 2 lugares diferentes
if (fr360Log.response_data?.phone) { /* usar esto */ }
else if (webhook.raw_data?.x_customer_movil) { /* usar esto otro */ }
```

**Problema:** No hay una estructura consistente para obtener datos.

3. **Logs como Array sin Estructura** ❌
```javascript
webhook.logs.all.find(log => log.stage === 'fr360_query' && log.status === 'success')
```

**Problema:** Buscar linealmente en array cada vez. No hay índice.

4. **Estado Calculado en Runtime** ❌
```javascript
// Cada vez que renderizamos, recalculamos:
const hasError = logs.some(log => log.status === 'error');
const hasSuccess = logs.some(log => log.status === 'success');
```

**Problema:** No se cachea. Se recalcula en cada render.

---

## Componentes Backend

### Archivo: `index.js` (Líneas 78-152)

#### Endpoints Proxy

**GET /api/webpig/webhooks**
```javascript
app.get('/api/webpig/webhooks', ensureAuthenticated, ensureDomain, async (req, res) => {
  const response = await fetch(
    `${process.env.FACTURADOR_WEBHOOK_BASE_URL}/api/webhooks/recent`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.FACTURADOR_WEBHOOK_BEARER_TOKEN}`
      }
    }
  );
  res.json(await response.json());
});
```

**GET /api/webpig/feature-flags**
```javascript
app.get('/api/webpig/feature-flags', ensureAuthenticated, ensureDomain, async (req, res) => {
  const response = await fetch(
    `${process.env.FACTURADOR_WEBHOOK_BASE_URL}/api/feature-flags`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.FACTURADOR_FEATURE_FLAGS_BEARER_TOKEN}`
      }
    }
  );
  res.json(await response.json());
});
```

**POST /api/webpig/feature-flags/:flagKey**
```javascript
app.post('/api/webpig/feature-flags/:flagKey', ensureAuthenticated, ensureDomain, async (req, res) => {
  const { flagKey } = req.params;
  const { value } = req.body;

  const response = await fetch(
    `${process.env.FACTURADOR_WEBHOOK_BASE_URL}/api/feature-flags/${flagKey}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.FACTURADOR_FEATURE_FLAGS_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    }
  );
  res.json(await response.json());
});
```

#### Variables de Entorno Requeridas

```bash
FACTURADOR_WEBHOOK_BASE_URL=https://sistema-externo.com
FACTURADOR_WEBHOOK_BEARER_TOKEN=token_secreto_1
FACTURADOR_FEATURE_FLAGS_BEARER_TOKEN=token_secreto_2
```

---

## Sistema de Feature Flags

### Flags Actuales

```javascript
{
  "MEMBERSHIPS_ENABLED": {
    value: true/false,
    description: "Permite crear membresías en FRAPP"
  },
  "WORLDOFFICE_INVOICE_ENABLED": {
    value: true/false,
    description: "Permite crear facturas en WorldOffice"
  },
  "WORLDOFFICE_DIAN_ENABLED": {
    value: true/false,
    description: "Permite emitir documentos electrónicos en DIAN"
  }
}
```

### Sistema de Permisos

**Por Email:**
```javascript
const FLAG_PERMISSIONS = {
  'MEMBERSHIPS_ENABLED': [
    'daniel.cardona@sentiretaller.com'
  ],
  'WORLDOFFICE_INVOICE_ENABLED': [
    'daniel.cardona@sentiretaller.com',
    'yicela.agudelo@sentiretaller.com',
    'ana.quintero@sentiretaller.com'
  ],
  'WORLDOFFICE_DIAN_ENABLED': [
    'daniel.cardona@sentiretaller.com',
    'yicela.agudelo@sentiretaller.com',
    'ana.quintero@sentiretaller.com'
  ]
};
```

**Validación:**
- Frontend valida y deshabilita toggles si no hay permiso
- Backend NO valida (asume que frontend lo hace) ⚠️

### Flujo de Feature Flag

```
1. Sistema externo recibe webhook
   ↓
2. Antes de ejecutar stage X, consulta feature flag
   ↓
3. Si flag = false:
     - Omite stage
     - Crea log con:
       status: 'info'
       response_data: {
         skipped: true,
         reason: "MEMBERSHIPS_ENABLED=false"
       }
   ↓
4. Si flag = true:
     - Ejecuta stage normalmente
     - Crea log con resultado (success/error)
```

---

## Problemas Actuales y Oportunidades de Mejora

### 1. Estructura de Datos Desordenada

**Problema:**
```javascript
// Información crítica está en strings no estructurados
"details": "Cliente: Juan Pérez, Cédula: 1234567890, Producto: Membresía Elite"
```

**Solución Propuesta:**
```javascript
{
  "stage": "fr360_query",
  "status": "success",
  "structured_data": {
    "customer_name": "Juan Pérez",
    "customer_cedula": "1234567890",
    "customer_email": "juan@example.com",
    "customer_phone": "573001234567",
    "product_name": "Membresía Elite",
    "product_id": "PROD-123"
  },
  "details": "Cliente Juan Pérez encontrado en FR360" // Human-readable
}
```

### 2. Logs como Array No Indexado

**Problema:**
```javascript
// Buscar linealmente cada vez
webhook.logs.all.find(log => log.stage === 'fr360_query')
```

**Solución Propuesta (Checkpoint-based):**
```javascript
{
  "checkpoints": {
    "invoice_extraction": {
      "status": "success",
      "completed_at": "2025-01-27T15:30:00Z",
      "data": {
        "invoice_id": "INV-001"
      }
    },
    "fr360_query": {
      "status": "success",
      "completed_at": "2025-01-27T15:30:01Z",
      "data": {
        "customer_name": "Juan Pérez",
        "customer_cedula": "1234567890"
      }
    },
    "membership_creation": {
      "status": "error",
      "completed_at": "2025-01-27T15:30:05Z",
      "error": "Timeout after 30s",
      "retry_count": 3
    }
  },
  "logs": [
    /* logs detallados para debugging */
  ]
}
```

**Ventajas:**
- ✅ Acceso O(1) a cualquier checkpoint
- ✅ Estado actual claro sin recalcular
- ✅ Timestamps de finalización
- ✅ Datos estructurados por checkpoint
- ✅ Logs separados para debugging detallado

### 3. Información Insuficiente

**Falta:**
- Timestamps de inicio y fin por stage
- Duración de cada stage
- Número de reintentos
- Relaciones entre stages (dependencias)
- Datos intermedios importantes

**Solución Propuesta:**
```javascript
{
  "checkpoints": {
    "membership_creation": {
      "status": "success",
      "started_at": "2025-01-27T15:30:02Z",
      "completed_at": "2025-01-27T15:30:05Z",
      "duration_ms": 3000,
      "retry_count": 0,
      "data": {
        "membership_id": "MEMB-12345",
        "membership_plan": "Elite Monthly",
        "start_date": "2025-01-27",
        "expiry_date": "2025-02-27"
      }
    }
  }
}
```

### 4. Sin Sistema de Reintentos Visible

**Problema:** No se sabe si un stage falló en el primer intento o después de reintentos

**Solución Propuesta:**
```javascript
{
  "checkpoints": {
    "worldoffice_invoice_creation": {
      "status": "error",
      "retry_count": 3,
      "max_retries": 3,
      "first_attempt_at": "2025-01-27T15:30:05Z",
      "last_attempt_at": "2025-01-27T15:31:35Z",
      "error": "Connection timeout",
      "error_history": [
        { "attempt": 1, "error": "Connection timeout", "timestamp": "..." },
        { "attempt": 2, "error": "Connection timeout", "timestamp": "..." },
        { "attempt": 3, "error": "Connection timeout", "timestamp": "..." }
      ]
    }
  }
}
```

### 5. Sin Tracking de Dependencias

**Problema:** No se sabe qué stages dependen de otros

**Solución Propuesta:**
```javascript
{
  "pipeline": {
    "stages": [
      {
        "name": "invoice_extraction",
        "depends_on": [],
        "required": true
      },
      {
        "name": "fr360_query",
        "depends_on": ["invoice_extraction"],
        "required": true
      },
      {
        "name": "membership_creation",
        "depends_on": ["fr360_query"],
        "required": false,
        "feature_flag": "MEMBERSHIPS_ENABLED"
      },
      {
        "name": "worldoffice_invoice_creation",
        "depends_on": ["membership_creation"],
        "required": false,
        "feature_flag": "WORLDOFFICE_INVOICE_ENABLED"
      }
    ]
  }
}
```

---

## Propuesta de Nueva Estructura con Checkpoints

### Estructura Completa Propuesta

```javascript
{
  "id": 123,
  "invoice_id": "INV-20250127-001",
  "transaction_status": "accepted", // accepted | rejected
  "created_at": "2025-01-27T15:30:00Z",
  "updated_at": "2025-01-27T15:31:45Z",

  // DATOS ESTRUCTURADOS DEL CLIENTE (No parsing)
  "customer": {
    "name": "Juan Pérez",
    "cedula": "1234567890",
    "email": "juan@example.com",
    "phone": "573001234567"
  },

  // DATOS ESTRUCTURADOS DEL PRODUCTO
  "product": {
    "name": "Membresía Elite",
    "id": "PROD-123",
    "category": "Membresías",
    "price": 250000
  },

  // ESTADO GENERAL DEL PIPELINE
  "pipeline_status": {
    "overall": "partial_success", // success | partial_success | failed | processing
    "completed_stages": 7,
    "failed_stages": 1,
    "skipped_stages": 1,
    "total_stages": 9,
    "started_at": "2025-01-27T15:30:00Z",
    "completed_at": "2025-01-27T15:31:45Z",
    "duration_ms": 105000
  },

  // CHECKPOINTS - ACCESO RÁPIDO POR NOMBRE
  "checkpoints": {
    "invoice_extraction": {
      "status": "success",
      "started_at": "2025-01-27T15:30:00Z",
      "completed_at": "2025-01-27T15:30:00Z",
      "duration_ms": 150,
      "data": {
        "invoice_id": "INV-20250127-001",
        "amount": 250000,
        "currency": "COP"
      }
    },

    "fr360_query": {
      "status": "success",
      "started_at": "2025-01-27T15:30:01Z",
      "completed_at": "2025-01-27T15:30:02Z",
      "duration_ms": 1200,
      "data": {
        "customer_found": true,
        "customer_id": "CUST-456"
      }
    },

    "membership_creation": {
      "status": "success",
      "started_at": "2025-01-27T15:30:02Z",
      "completed_at": "2025-01-27T15:30:05Z",
      "duration_ms": 3000,
      "retry_count": 0,
      "data": {
        "membership_id": "MEMB-12345",
        "plan": "Elite Monthly",
        "start_date": "2025-01-27",
        "expiry_date": "2025-02-27"
      }
    },

    "crm_upsert": {
      "status": "success",
      "started_at": "2025-01-27T15:30:05Z",
      "completed_at": "2025-01-27T15:30:08Z",
      "duration_ms": 3000,
      "data": {
        "crm_id": "CRM-789",
        "action": "updated" // created | updated
      }
    },

    "worldoffice_customer": {
      "status": "success",
      "started_at": "2025-01-27T15:30:08Z",
      "completed_at": "2025-01-27T15:30:10Z",
      "duration_ms": 2000,
      "data": {
        "customer_code": "CLI-001"
      }
    },

    "worldoffice_invoice_creation": {
      "status": "error",
      "started_at": "2025-01-27T15:30:10Z",
      "completed_at": "2025-01-27T15:31:40Z",
      "duration_ms": 90000,
      "retry_count": 3,
      "max_retries": 3,
      "error": {
        "message": "Connection timeout to WorldOffice API",
        "code": "TIMEOUT_ERROR",
        "recoverable": true
      },
      "attempts": [
        { "attempt": 1, "timestamp": "...", "error": "Timeout", "duration_ms": 30000 },
        { "attempt": 2, "timestamp": "...", "error": "Timeout", "duration_ms": 30000 },
        { "attempt": 3, "timestamp": "...", "error": "Timeout", "duration_ms": 30000 }
      ]
    },

    "worldoffice_dian_emission": {
      "status": "skipped",
      "skipped_at": "2025-01-27T15:31:40Z",
      "reason": {
        "type": "feature_flag",
        "flag_name": "WORLDOFFICE_DIAN_ENABLED",
        "flag_value": false
      }
    },

    "strapi_cartera_update": {
      "status": "success",
      "started_at": "2025-01-27T15:31:40Z",
      "completed_at": "2025-01-27T15:31:42Z",
      "duration_ms": 2000,
      "data": {
        "cartera_id": "CART-999",
        "balance": 250000
      }
    },

    "strapi_facturacion_creation": {
      "status": "success",
      "started_at": "2025-01-27T15:31:42Z",
      "completed_at": "2025-01-27T15:31:45Z",
      "duration_ms": 3000,
      "data": {
        "facturacion_id": "FACT-555"
      }
    }
  },

  // LOGS DETALLADOS (Para debugging - opcional mostrar en UI)
  "logs": [
    {
      "timestamp": "2025-01-27T15:30:00Z",
      "level": "info",
      "stage": "invoice_extraction",
      "message": "Iniciando extracción de invoice ID",
      "request_payload": { /* ... */ }
    },
    {
      "timestamp": "2025-01-27T15:30:00Z",
      "level": "info",
      "stage": "invoice_extraction",
      "message": "Invoice ID extraído exitosamente: INV-20250127-001",
      "response_data": { /* ... */ }
    },
    // ... más logs detallados
  ],

  // DATOS RAW DEL WEBHOOK ORIGINAL (Para referencia)
  "raw_webhook": {
    "x_ref_payco": "REF123",
    "x_transaction_id": "TX456",
    "x_amount": "250000",
    "x_currency_code": "COP",
    "x_customer_name": "Juan Pérez",
    "x_customer_email": "juan@example.com",
    "x_customer_movil": "3001234567",
    // ... todos los campos originales del webhook
  }
}
```

### Ventajas del Sistema de Checkpoints

1. **Acceso O(1)** - `webhook.checkpoints.membership_creation` en lugar de buscar en array
2. **Estado claro** - Cada checkpoint tiene status, timestamps, duración
3. **Reintentos visibles** - Se ve cuántas veces se intentó y cuándo
4. **Datos estructurados** - No más regex parsing
5. **Separación de concerns** - Checkpoints para estado, Logs para debugging
6. **Métricas fáciles** - Duración por stage, tasa de éxito, etc.

---

## Cambios Necesarios en el Sistema Externo (Facturador)

### 1. Al Procesar Webhook

```javascript
// ANTES (actual)
async function processWebhook(webhookData) {
  const webhook = { id, logs: { all: [] }, raw_data: webhookData };

  // Stage 1
  try {
    const result = await extractInvoice();
    webhook.logs.all.push({
      stage: 'invoice_extraction',
      status: 'success',
      details: `Invoice ID extraído: ${result.invoiceId}`
    });
  } catch (error) {
    webhook.logs.all.push({
      stage: 'invoice_extraction',
      status: 'error',
      error_message: error.message
    });
  }

  // ... más stages
}
```

```javascript
// DESPUÉS (propuesto)
async function processWebhook(webhookData) {
  const webhook = {
    id,
    checkpoints: {},
    logs: [],
    pipeline_status: {
      overall: 'processing',
      completed_stages: 0,
      failed_stages: 0,
      skipped_stages: 0
    }
  };

  // Stage 1
  const checkpoint = {
    status: 'processing',
    started_at: new Date().toISOString()
  };

  try {
    const result = await extractInvoice();

    checkpoint.status = 'success';
    checkpoint.completed_at = new Date().toISOString();
    checkpoint.duration_ms = Date.now() - startTime;
    checkpoint.data = {
      invoice_id: result.invoiceId,
      amount: result.amount
    };

    webhook.pipeline_status.completed_stages++;

  } catch (error) {
    checkpoint.status = 'error';
    checkpoint.completed_at = new Date().toISOString();
    checkpoint.duration_ms = Date.now() - startTime;
    checkpoint.error = {
      message: error.message,
      code: error.code,
      recoverable: true
    };

    webhook.pipeline_status.failed_stages++;
  }

  webhook.checkpoints.invoice_extraction = checkpoint;

  // Log detallado (opcional)
  webhook.logs.push({
    timestamp: checkpoint.completed_at,
    level: checkpoint.status === 'success' ? 'info' : 'error',
    stage: 'invoice_extraction',
    message: checkpoint.status === 'success'
      ? `Invoice ID extraído: ${checkpoint.data.invoice_id}`
      : checkpoint.error.message
  });
}
```

### 2. Feature Flags

```javascript
// ANTES
if (!featureFlags.MEMBERSHIPS_ENABLED) {
  webhook.logs.all.push({
    stage: 'membership_creation',
    status: 'info',
    response_data: {
      skipped: true,
      reason: 'MEMBERSHIPS_ENABLED=false'
    }
  });
  return;
}
```

```javascript
// DESPUÉS
if (!featureFlags.MEMBERSHIPS_ENABLED) {
  webhook.checkpoints.membership_creation = {
    status: 'skipped',
    skipped_at: new Date().toISOString(),
    reason: {
      type: 'feature_flag',
      flag_name: 'MEMBERSHIPS_ENABLED',
      flag_value: false
    }
  };
  webhook.pipeline_status.skipped_stages++;
  return;
}
```

---

## Cambios Necesarios en FR360 (Web Pig)

### 1. Simplificar Extractors

```javascript
// ANTES
function extractCustomer(webhook) {
  const fr360Log = webhook.logs.all.find(log =>
    log.stage === 'fr360_query' && log.status === 'success'
  );
  if (fr360Log && fr360Log.details) {
    const match = fr360Log.details.match(/Cliente:\s*([^,]+)/);
    if (match) return match[1].trim();
  }
  return webhook.customer?.name || 'N/A';
}
```

```javascript
// DESPUÉS
function extractCustomer(webhook) {
  return webhook.customer?.name || 'N/A';
}
```

### 2. Acceso Directo a Checkpoints

```javascript
// ANTES
function getStageStatus(webhook, columnName, isAccepted) {
  const relevantStages = Object.entries(STAGE_COLUMNS)
    .filter(([_, col]) => col === columnName)
    .map(([stage, _]) => stage);

  const logs = webhook.logs.all.filter(log =>
    relevantStages.includes(log.stage)
  );

  const hasError = logs.some(log => log.status === 'error');
  // ... más lógica
}
```

```javascript
// DESPUÉS
function getStageStatus(webhook, columnName, isAccepted) {
  if (!isAccepted) {
    return { status: 'not-applicable', icon: '-' };
  }

  const relevantStages = Object.entries(STAGE_COLUMNS)
    .filter(([_, col]) => col === columnName)
    .map(([stage, _]) => stage);

  // Acceso directo O(1)
  const checkpoints = relevantStages.map(stage => webhook.checkpoints[stage]).filter(Boolean);

  if (checkpoints.length === 0) {
    return { status: 'not-run', icon: '⛔' };
  }

  // Estado ya calculado en el checkpoint
  const hasSkipped = checkpoints.some(cp => cp.status === 'skipped');
  const hasError = checkpoints.some(cp => cp.status === 'error');
  const hasSuccess = checkpoints.some(cp => cp.status === 'success');
  const hasProcessing = checkpoints.some(cp => cp.status === 'processing');

  if (hasSkipped) return { status: 'skipped', icon: '⚠️', checkpoints };
  if (hasError) return { status: 'error', icon: '⛔', checkpoints };
  if (hasSuccess) return { status: 'success', icon: '✅', checkpoints };
  if (hasProcessing) return { status: 'pending', icon: '⏳', checkpoints };

  return { status: 'not-run', icon: '⛔', checkpoints };
}
```

### 3. Modal con Checkpoints

```javascript
// DESPUÉS
function showStageDetails(columnName, checkpoints, webhookData) {
  const modal = document.getElementById('stageDetailsModal');
  const title = document.getElementById('stageDetailsTitle');
  const body = document.getElementById('stageDetailsBody');

  title.textContent = `Detalles: ${columnName}`;

  body.innerHTML = checkpoints.map(checkpoint => {
    const statusClass = checkpoint.status === 'success' ? 'success' :
                       checkpoint.status === 'error' ? 'error' : 'info';

    let duration = '';
    if (checkpoint.duration_ms) {
      duration = `<span class="duration">(${checkpoint.duration_ms}ms)</span>`;
    }

    let retryInfo = '';
    if (checkpoint.retry_count > 0) {
      retryInfo = `<div class="retry-info">Reintentos: ${checkpoint.retry_count}/${checkpoint.max_retries}</div>`;
    }

    return `
      <div class="checkpoint-item ${statusClass}">
        <div class="checkpoint-header">
          <span class="checkpoint-stage">${checkpoint.stage_name}</span>
          <span class="checkpoint-timestamp">${formatDate(checkpoint.completed_at || checkpoint.started_at)}</span>
          ${duration}
        </div>

        ${retryInfo}

        ${checkpoint.data ? `
          <div class="checkpoint-data">
            <h4>Datos del Stage</h4>
            <pre>${JSON.stringify(checkpoint.data, null, 2)}</pre>
          </div>
        ` : ''}

        ${checkpoint.error ? `
          <div class="checkpoint-error">
            <h4>Error</h4>
            <div><strong>Mensaje:</strong> ${checkpoint.error.message}</div>
            <div><strong>Código:</strong> ${checkpoint.error.code}</div>
            <div><strong>Recuperable:</strong> ${checkpoint.error.recoverable ? 'Sí' : 'No'}</div>
          </div>
        ` : ''}

        ${checkpoint.status === 'skipped' ? `
          <div class="checkpoint-skipped">
            <h4>Omitido</h4>
            <div><strong>Razón:</strong> ${checkpoint.reason.type}</div>
            <div><strong>Flag:</strong> ${checkpoint.reason.flag_name} = ${checkpoint.reason.flag_value}</div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  modal.classList.remove('hidden');
}
```

---

## Recomendaciones para la Migración

### Fase 1: Agregar Checkpoints (Sin Romper Compatibilidad)

1. Sistema externo empieza a agregar campo `checkpoints` **además** de `logs.all`
2. FR360 sigue funcionando con `logs.all` (sin cambios)
3. Verificar que ambos sistemas coexisten

### Fase 2: Migrar Frontend a Checkpoints

1. Cambiar extractors en webpig.js
2. Cambiar getStageStatus() a usar checkpoints
3. Actualizar modal para mostrar checkpoint data
4. Desplegar y verificar

### Fase 3: Deprecar Logs Detallados (Opcional)

1. Sistema externo deja de generar logs detallados
2. Solo mantiene checkpoints
3. Reduce tamaño de webhooks

---

## Métricas Adicionales Posibles

Con la nueva estructura, se pueden agregar métricas:

```javascript
{
  "metrics": {
    "total_duration_ms": 105000,
    "average_stage_duration_ms": 11667,
    "slowest_stage": {
      "name": "worldoffice_invoice_creation",
      "duration_ms": 90000
    },
    "success_rate": 88.9, // 8/9 stages exitosos
    "retry_stages": 1,
    "total_retries": 3
  }
}
```

---

## Conclusión

El sistema actual de Web Pig funciona pero tiene limitaciones importantes:

**Problemas Principales:**
1. ❌ Parsing de strings con regex (frágil)
2. ❌ Información dispersa en múltiples lugares
3. ❌ Búsquedas lineales en arrays (O(n))
4. ❌ Estado calculado en runtime (no cacheado)
5. ❌ Falta información sobre duración, reintentos, dependencias

**Solución Propuesta: Sistema de Checkpoints**
1. ✅ Datos estructurados (no parsing)
2. ✅ Acceso O(1) por nombre de stage
3. ✅ Estado pre-calculado en el webhook
4. ✅ Información completa (duración, reintentos, datos)
5. ✅ Separación clara: checkpoints para estado, logs para debugging

Esta documentación debe permitir a tu otra instancia de Claude entender completamente cómo funciona Web Pig actualmente y qué cambios propones para los webhooks.
