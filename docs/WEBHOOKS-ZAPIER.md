# Flujo de Webhooks: ePayco → Render → Zapier

## Cambio implementado

### Antes:
```
ePayco → Apps Script → [Render, Zapier en paralelo]
```

### Ahora:
```
ePayco → Render → Zapier
```

## Cómo funciona

1. **ePayco envía webhook directamente a Render**
   - URL: `https://tu-dominio-render.com/api/webhooks`
   - Sin autenticación (validado por ePayco usando `x_cust_id_cliente`)

2. **Render procesa el webhook** (PASOS 1-7)
   - Extrae invoice ID
   - Consulta FR360
   - Envía notificación Callbell
   - Crea membresías (si aplica)
   - Gestiona contacto en CRM
   - Crea cliente en World Office
   - Factura en World Office (crear, contabilizar, DIAN)
   - Registra en Strapi + actualiza carteras

3. **Render reenvía a Zapier** (PASO 8 - ÚLTIMO)
   - URL: `https://hooks.zapier.com/hooks/catch/7310127/udhxcza/`
   - Envía el webhook original completo (`raw_data`)
   - **No es crítico**: Si falla, no bloquea el proceso principal

## Configuración en ePayco

Actualizar la URL de confirmación en ePayco:

**Antes:**
```
https://script.google.com/macros/s/[ID_DEL_APPS_SCRIPT]/exec
```

**Ahora:**
```
https://tu-dominio-render.com/api/webhooks
```

## Ventajas del nuevo flujo

1. ✅ **Más simple**: Un solo punto de entrada
2. ✅ **Más confiable**: No depende de Apps Script como intermediario
3. ✅ **Mejor logging**: Todo el procesamiento queda registrado en nuestra BD
4. ✅ **Orden garantizado**: Zapier recibe el webhook DESPUÉS de que nuestro proceso termine
5. ✅ **No crítico**: Si Zapier falla, no afecta nuestro proceso principal

## Código implementado

### Servicio de Zapier
[src/services/zapierService.js](../src/services/zapierService.js)
- Función `forwardToZapier(webhookData)` para reenviar webhooks

### Integración en el procesador
[src/services/webhookProcessor.js](../src/services/webhookProcessor.js) línea 1416-1470
- PASO 8: Reenvío a Zapier como último paso
- Try-catch para no bloquear si falla
- Log con stage `zapier_forward`

## Monitoreo

Los reenvíos a Zapier se registran en:

1. **webhook_logs** tabla:
   - Stage: `zapier_forward`
   - Status: `success` o `warning`
   - Details: Resultado del reenvío

2. **Logs de aplicación**:
   ```
   [Processor] PASO 8: Reenviando webhook a Zapier
   [Zapier] Reenviando webhook a Zapier: 320374450
   [Zapier] ✅ Webhook reenviado exitosamente a Zapier
   ```

3. **Notificación Google Chat**:
   - Paso 10: REENVÍO A ZAPIER
   - Status: ✅ Enviado / ⚠️ Error

## Apps Script anterior

El Apps Script ya NO es necesario y puede ser eliminado o dejado como backup.

Si deseas mantenerlo como backup:
- Actualiza ePayco para usar la URL de Render
- Mantén el Apps Script sin cambios (por si necesitas volver atrás)
