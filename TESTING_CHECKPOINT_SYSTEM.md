# Testing del Sistema de Checkpoints

## ✅ Cambios Implementados

Se agregaron checkpoints a los 2 stages **CRÍTICOS** que causaron duplicación en el webhook 373:

1. **worldoffice_invoice_creation** - Previene duplicación de facturas
2. **strapi_facturacion_creation** - Previene duplicación de registros

## 📊 Estado Actual de Checkpoints

| Stage | Skip Logic | Checkpoint Save | Estado | Impacto si se repite |
|-------|-----------|-----------------|---------|---------------------|
| invoice_extraction | ✅ | ✅ | COMPLETO | Bajo |
| fr360_query | ✅ | ✅ | COMPLETO | Bajo (solo query) |
| callbell_notification | ✅ | ✅ | COMPLETO | 🚨 Alto (WhatsApp duplicado) |
| membership_creation | ✅ | ✅ | COMPLETO | 🚨 Alto (membresía duplicada) |
| **worldoffice_invoice_creation** | ✅ | ✅ | **COMPLETO** | **🚨 CRÍTICO (factura duplicada)** |
| **strapi_facturacion_creation** | ✅ | ✅ | **COMPLETO** | **🚨 CRÍTICO (registro duplicado)** |
| crm_management | ❌ | ✅ | PARCIAL | Medio (contacto re-actualizado) |
| worldoffice_customer | ❌ | ❌ | FALTA | Medio (cliente re-actualizado) |
| worldoffice_invoice_accounting | ❌ | ❌ | FALTA | Bajo (podría fallar si ya contabilizada) |
| worldoffice_dian_emission | ❌ | ❌ | FALTA | Bajo (podría fallar si ya emitida) |

## 🧪 Plan de Testing

### Test 1: Verificar Endpoint Re-habilitado

```bash
# Probar que el endpoint responde
curl -X POST "https://facturador-webhook-processor.onrender.com/api/webhooks/373/retry" \
  -H "Authorization: Bearer 38af4464619ec3be6bd8797df5315154d2979ace9c24f79e8794347496ddae98" \
  -H "Content-Type: application/json" \
  -d '{}'

# Respuesta esperada:
# {
#   "success": false,
#   "error": "Webhook 373 ya está completado y tiene facturas/registros creados"
# }
# O si permite:
# {
#   "success": true,
#   "message": "Webhook en cola para reprocesamiento inteligente"
# }
```

### Test 2: Verificar Checkpoints del Webhook 373

```bash
# Ver checkpoints guardados
curl -s "https://facturador-webhook-processor.onrender.com/api/webhooks?id=373" \
  -H "Authorization: Bearer 38af4464619ec3be6bd8797df5315154d2979ace9c24f79e8794347496ddae98" \
  | python -c "import sys, json; d=json.load(sys.stdin); w=d['webhook']; print('Completed stages:', w['completed_stages']); print('Processing context keys:', list(w['processing_context'].keys()))"
```

**Respuesta esperada:**
```
Completed stages: ['invoice_extraction', 'fr360_query', 'callbell_notification', 'membership_creation']
Processing context keys: ['invoice_extraction', 'fr360_query', 'callbell_notification', 'membership_creation']
```

**⚠️ NOTA:** Los stages de WorldOffice y Strapi NO aparecerán porque se ejecutaron ANTES de implementar sus checkpoints.

### Test 3: Probar con Webhook Nuevo (Simulación)

Para probar el sistema completo, necesitamos:

1. **Crear un webhook de prueba que falle intencionalmente**
2. **Hacer retry y verificar que use checkpoints**

```bash
# OPCIÓN A: Usar webhook existente que falló antes de WorldOffice
# (buscar uno con status='error' y failed_stage anterior a worldoffice_invoice_creation)

# OPCIÓN B: Modificar temporalmente el código para forzar un fallo
# Por ejemplo, hacer que worldoffice_invoice_creation falle después de guardar checkpoint
```

### Test 4: Verificar Logs con "SKIP"

Después de un retry, verificar que aparezcan mensajes de SKIP en los logs:

```bash
# Ver logs del webhook
curl -s "https://facturador-webhook-processor.onrender.com/api/webhooks?id=XXX" \
  -H "Authorization: Bearer TOKEN" \
  | python -c "import sys, json; d=json.load(sys.stdin); [print(f\"{log['created_at']} - {log['stage']}: {log['details'][:100]}\") for log in d['webhook']['logs']['all']]" \
  | grep -i skip
```

**Deberías ver:**
```
2025-10-28... - invoice_extraction: ⏭️ SKIP invoice_extraction - Cargado desde checkpoint
2025-10-28... - fr360_query: ⏭️ SKIP fr360_query - Cargado desde checkpoint
2025-10-28... - worldoffice_invoice_creation: ⏭️ SKIP worldoffice_invoice_creation - Factura 25290 ya creada
```

## ⚠️ Limitaciones Actuales

### Stages que AÚN SE RE-EJECUTARÁN en Retry:

1. **crm_management**
   - Tiene checkpoint guardado pero NO skip logic
   - Se ejecutará de nuevo pero es idempotente (solo actualiza)
   - Impacto: Bajo

2. **worldoffice_customer**
   - NO tiene checkpoint
   - Se ejecutará de nuevo
   - Impacto: Medio (actualización de cliente, idempotente)

3. **worldoffice_invoice_accounting**
   - NO tiene checkpoint
   - Se ejecutará de nuevo
   - Podría fallar si la factura ya está contabilizada
   - Impacto: Bajo (el error no rompe el flujo)

4. **worldoffice_dian_emission**
   - NO tiene checkpoint
   - Se ejecutará de nuevo (si está habilitado)
   - Podría fallar si ya fue emitida
   - Impacto: Bajo (no es crítico)

### Por qué es Aceptable:

- Los stages críticos (factura, strapi) YA NO se duplican ✅
- Los stages que se repiten son idempotentes o sus errores no son fatales
- CRM y WO Customer simplemente actualizan datos existentes
- WO Accounting y DIAN podrían fallar pero no rompen el flujo

## 🎯 Siguiente Paso Recomendado

### Opción A: Testing Inmediato (Sin más cambios)

1. Buscar webhook reciente con error
2. Hacer retry
3. Verificar que no se dupliquen facturas ni registros
4. Aceptar que otros stages se re-ejecuten (no es crítico)

### Opción B: Completar Checkpoints Restantes (Más seguro)

1. Implementar los 4 checkpoints faltantes
2. Testear exhaustivamente
3. Tener sistema 100% protegido

## 📝 Comandos Útiles para Testing

### Ver últimos webhooks con error
```bash
curl -s "https://facturador-webhook-processor.onrender.com/api/webhooks?status=error&limit=10" \
  -H "Authorization: Bearer TOKEN" \
  | python -c "import sys, json; d=json.load(sys.stdin); [print(f\"ID: {w['id']}, Status: {w['status']}, Failed: {w.get('failed_stage', 'N/A')}, Retry: {w.get('retry_count', 0)}\") for w in d['webhooks']]"
```

### Ver detalles de un webhook específico
```bash
curl -s "https://facturador-webhook-processor.onrender.com/api/webhooks?id=XXX" \
  -H "Authorization: Bearer TOKEN" \
  | python -m json.tool > webhook_XXX_details.json
```

### Hacer retry de un webhook
```bash
curl -X POST "https://facturador-webhook-processor.onrender.com/api/webhooks/XXX/retry" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force_restart": false, "max_retries": 3}'
```

### Verificar resultado después del retry
```bash
# Esperar 30 segundos
sleep 30

# Ver resultado
curl -s "https://facturador-webhook-processor.onrender.com/api/webhooks?id=XXX" \
  -H "Authorization: Bearer TOKEN" \
  | python -c "import sys, json; d=json.load(sys.stdin); w=d['webhook']; print(f\"Status: {w['status']}\"); print(f\"Retry count: {w['retry_count']}\"); print(f\"Completed stages: {w['completed_stages']}\"); print(f\"Failed stage: {w.get('failed_stage', 'None')}\")"
```

## ✅ Criterios de Éxito

Un retry exitoso debe:

1. ✅ NO crear facturas duplicadas en WorldOffice
2. ✅ NO crear registros duplicados en Strapi
3. ✅ NO enviar WhatsApp duplicado
4. ✅ NO crear membresías duplicadas
5. ✅ Mostrar logs con "⏭️ SKIP" en stages con checkpoint
6. ✅ Completar el webhook exitosamente (status='completed')
7. ✅ Incrementar retry_count en 1
8. ✅ Mantener completed_stages intactos

## 🚨 Señales de Alerta

Si ves esto, HAY UN PROBLEMA:

- ❌ Dos facturas con el mismo invoice_id en WorldOffice
- ❌ Dos registros de facturación en Strapi con el mismo acuerdo+fecha
- ❌ Dos mensajes de WhatsApp al mismo cliente (mismo timestamp)
- ❌ Dos membresías idénticas para el mismo usuario
- ❌ NO aparecen logs con "⏭️ SKIP"
- ❌ completed_stages está vacío después del retry

---

**Fecha de implementación:** 2025-10-28
**Versión:** v2.0 - Checkpoints críticos implementados
**Próxima mejora:** Implementar checkpoints en los 4 stages restantes
