# 🔧 Actualización Manual de Webhooks

## Endpoint

**`PATCH /api/webhooks/:id/status`**

**Autenticación:** ✅ Requiere Bearer Token

**Descripción:** Permite actualizar manualmente el estado de un webhook sin reprocesarlo.

---

## Casos de Uso

### 1. Marcar como Completado

Si un webhook fue procesado manualmente por otro sistema:

```bash
curl -X PATCH \
  -H "Authorization: Bearer tu_token" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed",
    "current_stage": null,
    "last_completed_stage": "completed"
  }' \
  https://tu-api.com/api/webhooks/4/status
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook actualizado correctamente",
  "webhook": {
    "id": 4,
    "ref_payco": "314625408",
    "status": "completed",
    "current_stage": null,
    "last_completed_stage": "completed",
    "updated_at": "2025-10-20T18:30:00Z"
  }
}
```

---

### 2. Marcar un Webhook como Error

```bash
curl -X PATCH \
  -H "Authorization: Bearer tu_token" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "error",
    "current_stage": "worldoffice_dian",
    "last_completed_stage": "worldoffice_accounting"
  }' \
  https://tu-api.com/api/webhooks/42/status
```

---

### 3. Resetear a Pendiente para Reprocesar

```bash
curl -X PATCH \
  -H "Authorization: Bearer tu_token" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "pending",
    "current_stage": null,
    "last_completed_stage": null
  }' \
  https://tu-api.com/api/webhooks/42/status
```

---

### 4. Actualizar Solo el Stage Actual

Puedes actualizar campos individuales. Los demás permanecen sin cambios:

```bash
curl -X PATCH \
  -H "Authorization: Bearer tu_token" \
  -H "Content-Type: application/json" \
  -d '{
    "current_stage": "callbell_notification"
  }' \
  https://tu-api.com/api/webhooks/42/status
```

---

## Campos Disponibles

| Campo | Tipo | Descripción | Valores Válidos |
|-------|------|-------------|-----------------|
| `status` | string | Estado del webhook | `pending`, `processing`, `completed`, `error`, `not_processed` |
| `current_stage` | string o null | Stage en el que está actualmente | Ver lista de stages abajo, o `null` |
| `last_completed_stage` | string o null | Último stage completado exitosamente | Ver lista de stages abajo, o `null` |

**Nota:** Puedes enviar solo los campos que quieras actualizar. Los demás permanecerán sin cambios.

---

## Lista de Stages

- `started`
- `invoice_extraction`
- `fr360_query`
- `crm_upsert`
- `membership_creation`
- `callbell_notification`
- `worldoffice_customer`
- `worldoffice_invoice`
- `worldoffice_accounting`
- `worldoffice_dian`
- `strapi_save`
- `completed`
- `error`
- `manual_update`

---

## Validaciones

### Status inválido

Si envías un status que no existe:

```bash
curl -X PATCH \
  -H "Authorization: Bearer tu_token" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "invalido"
  }' \
  https://tu-api.com/api/webhooks/42/status
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "Status inválido. Debe ser uno de: pending, processing, completed, error, not_processed"
}
```

### Webhook no encontrado

Si el ID no existe:

**Response (404 Not Found):**
```json
{
  "success": false,
  "error": "Webhook no encontrado"
}
```

---

## Registro en Logs

Cada actualización manual se registra automáticamente en `webhook_logs`:

```sql
SELECT * FROM webhook_logs WHERE webhook_id = 4 AND stage = 'manual_update';
```

**Ejemplo de log:**
```
stage: manual_update
status: success
details: Actualización manual: {"status":"completed","current_stage":null,"last_completed_stage":"completed","updated_at":"2025-10-20T18:30:00.000Z"}
```

---

## Ejemplo Práctico: Tu Webhook ID 4

Para marcar el webhook 4 como completado:

```bash
curl -X PATCH \
  -H "Authorization: Bearer 38af4464619ec3be6bd8797df5315154d2979ace9c24f79e8794347496ddae98" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed",
    "current_stage": null,
    "last_completed_stage": "completed"
  }' \
  https://facturador-webhook-processor.onrender.com/api/webhooks/4/status
```

Después verifica que ya no aparezca en incompletos:

```bash
curl -H "Authorization: Bearer 38af4464619ec3be6bd8797df5315154d2979ace9c24f79e8794347496ddae98" \
  https://facturador-webhook-processor.onrender.com/api/webhooks/incomplete
```

**Debería retornar:**
```json
{
  "success": true,
  "message": "Webhooks que no están 100% completados",
  "total": 0,
  "webhooks": []
}
```

---

## JavaScript Example

```javascript
async function updateWebhookStatus(webhookId, updates) {
  const response = await fetch(
    `https://tu-api.com/api/webhooks/${webhookId}/status`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer tu_token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    }
  );

  const data = await response.json();
  console.log(data);
}

// Ejemplo de uso
updateWebhookStatus(4, {
  status: 'completed',
  current_stage: null,
  last_completed_stage: 'completed'
});
```

---

## Cuándo Usar Este Endpoint

✅ **Sí usar cuando:**
- Un webhook fue procesado manualmente fuera del sistema
- Necesitas corregir el estado de un webhook
- Quieres marcar webhooks de prueba como completados
- Necesitas resetear un webhook para reprocesarlo desde cero

❌ **No usar cuando:**
- Quieres que el sistema procese el webhook completo → Usa `POST /api/webhooks/:id/reprocess`
- Quieres ver el estado actual → Usa `GET /api/webhooks/:id`
