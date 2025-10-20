# API Endpoints - Sistema de Webhooks

## Resumen del Sistema

El sistema recibe webhooks de ePayco, los guarda inmediatamente en la base de datos y responde con `200 OK` en menos de 100ms. El procesamiento completo (consulta FR360, creación en CRM, membresías) se ejecuta en **background de forma asíncrona**.

---

## 🔐 Autenticación

**Todos los endpoints de consulta requieren autenticación Bearer Token**, excepto el endpoint POST que recibe webhooks de ePayco.

### Configurar el Token

1. Genera un token seguro (recomendado: 32+ caracteres):
```bash
# Genera un token aleatorio
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. Agrega el token a tu archivo `.env`:
```env
API_BEARER_TOKEN=tu_token_super_secreto_aqui_32_caracteres_minimo
```

### Usar el Token en Requests

Incluye el header `Authorization` con el formato `Bearer <token>`:

```bash
curl -H "Authorization: Bearer tu_token_super_secreto_aqui" \
  https://tu-api.com/api/webhooks
```

**Respuestas de error de autenticación:**

```json
// Sin token
{
  "success": false,
  "error": "No se proporcionó token de autenticación",
  "message": "Header Authorization requerido"
}

// Formato inválido
{
  "success": false,
  "error": "Formato de token inválido",
  "message": "Use: Authorization: Bearer <token>"
}

// Token incorrecto
{
  "success": false,
  "error": "Token de autenticación inválido"
}
```

---

## 📥 Recibir Webhook

**Endpoint:** `POST /api/webhooks`

**Autenticación:** ❌ No requiere (validado por ePayco)

**Descripción:** Recibe un webhook de ePayco, lo guarda y responde inmediatamente. El procesamiento se encola automáticamente.

**Response (Inmediato):**
```json
{
  "success": true,
  "message": "Webhook recibido correctamente",
  "ref": "1234567890",
  "id": 42
}
```

**Estados del webhook:**
- `pending` - Recibido, esperando procesamiento
- `processing` - Procesándose actualmente
- `completed` - Procesado exitosamente
- `error` - Error durante el procesamiento
- `not_processed` - No procesado (pago no aceptado)

---

## 📊 Consultar Webhooks

### 1. Listar todos los webhooks

**Endpoint:** `GET /api/webhooks`

**Autenticación:** ✅ Requiere Bearer Token

**Query Parameters:**
- `status` (opcional) - Filtrar por estado: `pending`, `processing`, `completed`, `error`
- `limit` (opcional, default: 50) - Número de resultados
- `offset` (opcional, default: 0) - Offset para paginación
- `order` (opcional, default: created_at) - Campo de ordenamiento
- `dir` (opcional, default: DESC) - Dirección: ASC o DESC

**Ejemplos:**

```bash
# Todos los webhooks
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks

# Solo webhooks pendientes
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks?status=pending

# Webhooks con error
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks?status=error

# Paginación
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks?limit=20&offset=40

# Webhooks completados, ordenados por fecha
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks?status=completed&order=created_at&dir=DESC
```

**Response:**
```json
{
  "success": true,
  "total": 150,
  "webhooks": [
    {
      "id": 42,
      "ref_payco": "1234567890",
      "transaction_id": "TX-123456",
      "invoice_id": "INV-789",
      "customer_email": "cliente@ejemplo.com",
      "customer_name": "Juan Pérez",
      "product": "Membresía Premium",
      "amount": "99000",
      "currency": "COP",
      "status": "completed",
      "created_at": "2025-10-20T10:30:00Z",
      "updated_at": "2025-10-20T10:31:00Z"
    }
  ]
}
```

---

### 2. Ver un webhook específico

**Endpoint:** `GET /api/webhooks/:id`

**Autenticación:** ✅ Requiere Bearer Token

**Descripción:** Obtiene detalles completos de un webhook incluyendo logs y membresías creadas.

**Ejemplo:**
```bash
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/42
```

**Response:**
```json
{
  "success": true,
  "webhook": {
    "id": 42,
    "ref_payco": "1234567890",
    "status": "completed",
    "logs": [
      {
        "id": 1,
        "stage": "started",
        "status": "processing",
        "details": "Iniciando procesamiento del webhook",
        "created_at": "2025-10-20T10:30:10Z"
      },
      {
        "id": 2,
        "stage": "fr360_query",
        "status": "processing",
        "details": "Consultando invoice INV-789 en FR360 API",
        "created_at": "2025-10-20T10:30:15Z"
      }
    ],
    "memberships": [
      {
        "id": 1,
        "fr360_membership_id": "MEM-123",
        "status": "active"
      }
    ]
  }
}
```

---

### 3. Ver logs detallados de un webhook

**Endpoint:** `GET /api/webhooks/:id/logs`

**Autenticación:** ✅ Requiere Bearer Token

**Descripción:** Obtiene SOLO los logs de procesamiento paso a paso.

**Ejemplo:**
```bash
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/42/logs
```

**Response:**
```json
{
  "success": true,
  "webhook_id": 42,
  "ref_payco": "1234567890",
  "status": "completed",
  "logs": [
    {
      "id": 1,
      "stage": "started",
      "status": "processing",
      "details": "Iniciando procesamiento del webhook",
      "error_message": null,
      "created_at": "2025-10-20T10:30:10Z"
    },
    {
      "id": 2,
      "stage": "fr360_query",
      "status": "processing",
      "details": "Consultando invoice INV-789 en FR360 API",
      "error_message": null,
      "created_at": "2025-10-20T10:30:15Z"
    },
    {
      "id": 3,
      "stage": "crm_upsert",
      "status": "processing",
      "details": "Buscando o creando contacto en CRM: cliente@ejemplo.com",
      "error_message": null,
      "created_at": "2025-10-20T10:30:20Z"
    },
    {
      "id": 4,
      "stage": "membership_creation",
      "status": "processing",
      "details": "Creando membresías para producto: Membresía Premium",
      "error_message": null,
      "created_at": "2025-10-20T10:30:45Z"
    },
    {
      "id": 5,
      "stage": "completed",
      "status": "success",
      "details": "Completado exitosamente. Producto: Membresía Premium | Membresías creadas | URL: https://...",
      "error_message": null,
      "created_at": "2025-10-20T10:31:00Z"
    }
  ]
}
```

---

### 4. Ver estadísticas generales

**Endpoint:** `GET /api/webhooks/stats`

**Autenticación:** ✅ Requiere Bearer Token

**Descripción:** Obtiene resumen estadístico de todos los webhooks.

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
    "pending": 5,
    "processing": 2,
    "completed": 143,
    "error": 3,
    "not_processed": 7
  },
  "recent": [
    {
      "id": 158,
      "ref_payco": "9876543210",
      "status": "processing",
      "invoice_id": "INV-999",
      "created_at": "2025-10-20T15:45:00Z"
    }
  ]
}
```

---

## 🔄 Reprocesar un Webhook

**Endpoint:** `POST /api/webhooks/:id/reprocess`

**Autenticación:** ✅ Requiere Bearer Token

**Descripción:** Reinicia el procesamiento de un webhook que falló o necesita reprocesarse.

**Ejemplo:**
```bash
curl -X POST \
  -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/42/reprocess
```

**Response:**
```json
{
  "success": true,
  "message": "Reprocesamiento iniciado",
  "webhook_id": 42
}
```

---

## 🔍 Casos de Uso Comunes

### Ver webhooks pendientes de procesar
```bash
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?status=pending"
```

### Ver webhooks con error en las últimas 24h
```bash
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?status=error&limit=100"
```

### Monitorear el progreso de un webhook específico
```bash
# Ver logs paso a paso
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/42/logs
```

### Ver dashboard de estadísticas
```bash
curl -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/stats
```

### Reprocesar todos los webhooks con error
```bash
# 1. Obtener webhooks con error
curl -H "Authorization: Bearer tu_token" \
  "https://tu-api.com/api/webhooks?status=error"

# 2. Reprocesar cada uno
curl -X POST -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/42/reprocess
curl -X POST -H "Authorization: Bearer tu_token" \
  https://tu-api.com/api/webhooks/43/reprocess
```

---

## 📋 Stages de Procesamiento

Cada webhook pasa por las siguientes etapas registradas en los logs:

1. **started** - Inicio del procesamiento
2. **fr360_query** - Consultando datos en FR360
3. **crm_upsert** - Creando/actualizando contacto en CRM
4. **membership_creation** - Creando membresías (si aplica)
5. **completed** - Finalizado exitosamente
6. **error** - Error en algún paso

---

## 🚀 Flujo Completo

```
1. ePayco envía webhook
   ↓
2. Sistema guarda en BD (status: pending)
   ↓
3. Responde 200 OK inmediatamente (< 100ms)
   ↓
4. Procesamiento en background:
   - Consulta FR360 (stage: fr360_query)
   - Crea contacto en CRM (stage: crm_upsert)
   - Crea membresías si aplica (stage: membership_creation)
   - Marca como completed
   ↓
5. Puedes consultar el progreso en cualquier momento:
   GET /api/webhooks/:id/logs
```
