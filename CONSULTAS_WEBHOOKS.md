# 🔍 Guía de Consultas de Webhooks

## Endpoints para Consultar Webhooks Incompletos

### 1. Ver TODOS los Webhooks Incompletos (No 100% completados)

**Endpoint:** `GET /api/webhooks/incomplete`

**Descripción:** Retorna todos los webhooks que NO tienen status `completed`. Incluye webhooks en procesamiento, con error, o pendientes.

**Ejemplo:**
```bash
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/incomplete
```

**Response:**
```json
{
  "success": true,
  "message": "Webhooks que no están 100% completados",
  "total": 15,
  "webhooks": [
    {
      "id": 42,
      "ref_payco": "1234567890",
      "invoice_id": "INV-789",
      "customer_email": "cliente@ejemplo.com",
      "status": "error",
      "current_stage": "worldoffice_dian",
      "last_completed_stage": "worldoffice_accounting",
      "created_at": "2025-10-20T10:30:00Z",
      "updated_at": "2025-10-20T10:35:00Z"
    },
    {
      "id": 43,
      "ref_payco": "9876543210",
      "invoice_id": "INV-790",
      "customer_email": "otro@ejemplo.com",
      "status": "processing",
      "current_stage": "callbell_notification",
      "last_completed_stage": "membership_creation",
      "created_at": "2025-10-20T11:00:00Z",
      "updated_at": "2025-10-20T11:02:00Z"
    }
  ]
}
```

---

### 2. Ver Webhooks Atascados en un Stage Específico

**Endpoint:** `GET /api/webhooks/stage/:stage`

**Descripción:** Retorna webhooks que están en un stage específico.

**Ejemplos:**

#### Ver webhooks atascados en emisión DIAN:
```bash
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/stage/worldoffice_dian
```

#### Ver webhooks atascados en Callbell:
```bash
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/stage/callbell_notification
```

#### Ver webhooks atascados en creación de factura:
```bash
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/stage/worldoffice_invoice
```

**Response:**
```json
{
  "success": true,
  "stage": "worldoffice_dian",
  "total": 3,
  "webhooks": [
    {
      "id": 42,
      "ref_payco": "1234567890",
      "invoice_id": "INV-789",
      "customer_email": "cliente@ejemplo.com",
      "status": "error",
      "current_stage": "worldoffice_dian",
      "last_completed_stage": "worldoffice_accounting",
      "created_at": "2025-10-20T10:30:00Z",
      "updated_at": "2025-10-20T10:35:00Z"
    }
  ]
}
```

---

### 3. Filtros Avanzados en el Endpoint Principal

**Endpoint:** `GET /api/webhooks`

**Query Parameters:**
- `incomplete=true` - Solo webhooks incompletos
- `status` - Filtrar por status (`pending`, `processing`, `error`, `completed`)
- `current_stage` - Filtrar por stage actual
- `last_completed_stage` - Filtrar por último stage completado
- `limit` - Número de resultados (default: 50)
- `offset` - Paginación (default: 0)
- `order` - Campo de ordenamiento (default: created_at)
- `dir` - Dirección (ASC/DESC, default: DESC)

**Ejemplos:**

#### Solo webhooks incompletos:
```bash
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?incomplete=true"
```

#### Webhooks con error:
```bash
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?status=error"
```

#### Webhooks procesándose actualmente:
```bash
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?status=processing"
```

#### Webhooks atascados en un stage (con query param):
```bash
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?current_stage=worldoffice_dian"
```

#### Webhooks que completaron hasta un stage específico:
```bash
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?last_completed_stage=worldoffice_accounting"
```

#### Combinar filtros - Webhooks con error en DIAN:
```bash
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?status=error&current_stage=worldoffice_dian"
```

---

### 4. Estadísticas Mejoradas

**Endpoint:** `GET /api/webhooks/stats`

**Descripción:** Ahora incluye estadísticas por stage y contador de incompletos.

**Ejemplo:**
```bash
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "byStatus": {
      "pending": 5,
      "processing": 2,
      "completed": 143,
      "error": 3
    },
    "byStage": {
      "worldoffice_dian": 2,
      "callbell_notification": 1,
      "worldoffice_invoice": 1
    },
    "incomplete": 10
  },
  "recent": [
    {
      "id": 158,
      "ref_payco": "9876543210",
      "status": "processing",
      "invoice_id": "INV-999",
      "current_stage": "worldoffice_dian",
      "last_completed_stage": "worldoffice_accounting",
      "created_at": "2025-10-20T15:45:00Z"
    }
  ]
}
```

---

## 📊 Casos de Uso Comunes

### Caso 1: Dashboard de Monitoreo

```bash
# Ver resumen general
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/stats

# Ver todos los webhooks incompletos
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/incomplete
```

### Caso 2: Detectar Problemas con DIAN

```bash
# Ver webhooks atascados en emisión DIAN
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/stage/worldoffice_dian

# Ver detalles de uno específico
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/42/logs
```

### Caso 3: Reprocesar Webhooks Atascados

```bash
# 1. Listar webhooks con error
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?status=error"

# 2. Ver logs de uno específico
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/42/logs

# 3. Reprocesar (retoma desde el stage que falló)
curl -X POST -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/42/reprocess
```

### Caso 4: Monitorear Avance en Tiempo Real

```bash
# Ver webhooks que están procesándose ahora
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?status=processing"

# Ver en qué stage están
# (verifica el campo current_stage en el response)
```

### Caso 5: Reporte de Webhooks Pendientes

```bash
# Ver todos los pendientes
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?status=pending"

# Ver cuántos hay en total
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/stats
```

---

## 🎯 Stages Disponibles

| Stage | Descripción |
|-------|-------------|
| `started` | Inicio del procesamiento |
| `invoice_extraction` | Extrayendo invoice ID |
| `fr360_query` | Consultando FR360 |
| `crm_upsert` | Creando/actualizando CRM |
| `membership_creation` | Creando membresías |
| `callbell_notification` | Notificando cliente |
| `worldoffice_customer` | Gestionando cliente WO |
| `worldoffice_invoice` | Creando factura |
| `worldoffice_accounting` | Contabilizando |
| `worldoffice_dian` | Emitiendo ante DIAN |
| `strapi_save` | Guardando en Strapi |
| `completed` | Completado 100% |
| `error` | Error general |

---

## 💡 Tips

### Paginación
```bash
# Primera página (50 registros)
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks/incomplete?limit=50&offset=0"

# Segunda página
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks/incomplete?limit=50&offset=50"
```

### Ordenamiento
```bash
# Más antiguos primero
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks/incomplete?order=created_at&dir=ASC"

# Más recientes primero (default)
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks/incomplete?order=created_at&dir=DESC"
```

---

## 🚀 Resumen Rápido

```bash
# ✅ Ver TODOS los incompletos (LA MÁS ÚTIL)
GET /api/webhooks/incomplete

# 🔍 Ver atascados en un stage específico
GET /api/webhooks/stage/worldoffice_dian

# 📊 Ver estadísticas (incluye contador de incompletos)
GET /api/webhooks/stats

# 🎯 Filtrar con query params
GET /api/webhooks?incomplete=true
GET /api/webhooks?status=error
GET /api/webhooks?current_stage=worldoffice_dian

# 📝 Ver logs detallados de uno específico
GET /api/webhooks/42/logs

# 🔄 Reprocesar desde donde falló
POST /api/webhooks/42/reprocess
```

---

## Ejemplo en JavaScript

```javascript
const BEARER_TOKEN = 'tu_token_aqui';
const API_URL = 'https://tu-api.com/api/webhooks';

async function getIncompleteWebhooks() {
  const response = await fetch(`${API_URL}/incomplete`, {
    headers: {
      'Authorization': `Bearer ${BEARER_TOKEN}`
    }
  });

  const data = await response.json();
  console.log(`Total incompletos: ${data.total}`);

  data.webhooks.forEach(webhook => {
    console.log(`ID: ${webhook.id}`);
    console.log(`Status: ${webhook.status}`);
    console.log(`Stage actual: ${webhook.current_stage}`);
    console.log(`Último completado: ${webhook.last_completed_stage}`);
    console.log('---');
  });
}

getIncompleteWebhooks();
```
