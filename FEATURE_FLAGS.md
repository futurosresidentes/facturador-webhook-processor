# Sistema de Feature Flags (Switches Dinámicos)

Este sistema permite activar/desactivar funcionalidades críticas **SIN NECESIDAD DE DEPLOYAR**, con efecto en menos de 10 segundos.

## 🎯 Switches Disponibles

### 1. `MEMBERSHIPS_ENABLED`
Controla la creación de membresías en Frapp.
- **`false`**: MODO TESTING - Simula la creación (no llama API real)
- **`true`**: MODO PRODUCCIÓN - Crea membresías reales en Frapp

### 2. `WORLDOFFICE_INVOICE_ENABLED`
Controla la creación de facturas en World Office.
- **`false`**: MODO TESTING - Simula la creación (no llama API real)
- **`true`**: MODO PRODUCCIÓN - Crea facturas reales en World Office

### 3. `WORLDOFFICE_DIAN_ENABLED`
Controla la emisión de facturas ante la DIAN.
- **`false`**: DESACTIVADO - Salta la emisión (no llama API)
- **`true`**: ACTIVADO - Emite facturas ante la DIAN

---

## 🚀 Cómo Usar los Switches

### Opción 1: CLI Script (Más Rápido)

```bash
# Ver estado de todos los switches
node toggle-switch.js list

# Activar un switch
node toggle-switch.js MEMBERSHIPS_ENABLED on "Juan"

# Desactivar un switch
node toggle-switch.js WORLDOFFICE_INVOICE_ENABLED off "Maria"

# Activar emisión DIAN
node toggle-switch.js WORLDOFFICE_DIAN_ENABLED on "Admin"
```

**Nota**: El tercer parámetro es opcional (nombre de quién hace el cambio).

### Opción 2: API REST (Requiere API Key)

```bash
# Listar todos los switches (NO requiere API key)
curl https://facturador-webhook-processor.onrender.com/api/feature-flags

# Activar un switch (REQUIERE API KEY)
curl -X PUT https://facturador-webhook-processor.onrender.com/api/feature-flags/MEMBERSHIPS_ENABLED \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"value": true, "updated_by": "Juan"}'

# Desactivar un switch (REQUIERE API KEY)
curl -X PUT https://facturador-webhook-processor.onrender.com/api/feature-flags/WORLDOFFICE_INVOICE_ENABLED \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"value": false, "updated_by": "Maria"}'
```

**Nota**: La API Key se configura en la variable de entorno `API_KEY` en Render.

---

## ⏱️ Tiempo de Efecto

Los cambios tardan **máximo 10 segundos** en aplicarse debido al sistema de caché:
- Los switches se leen de la base de datos
- Se cachean por 10 segundos para mejor rendimiento
- Cada 10 segundos se refresca el caché automáticamente

---

## 📋 Ejemplos de Uso Común

### Escenario 1: Activar TODO en Producción
```bash
node toggle-switch.js MEMBERSHIPS_ENABLED on "Admin"
node toggle-switch.js WORLDOFFICE_INVOICE_ENABLED on "Admin"
node toggle-switch.js WORLDOFFICE_DIAN_ENABLED on "Admin"
```

### Escenario 2: Modo Testing Completo
```bash
node toggle-switch.js MEMBERSHIPS_ENABLED off "Admin"
node toggle-switch.js WORLDOFFICE_INVOICE_ENABLED off "Admin"
node toggle-switch.js WORLDOFFICE_DIAN_ENABLED off "Admin"
```

### Escenario 3: Producción SIN Emisión DIAN (ej. pruebas finales)
```bash
node toggle-switch.js MEMBERSHIPS_ENABLED on "Admin"
node toggle-switch.js WORLDOFFICE_INVOICE_ENABLED on "Admin"
node toggle-switch.js WORLDOFFICE_DIAN_ENABLED off "Admin"  # ← NO emitir a DIAN
```

---

## 🔧 Instalación Inicial

1. **Instalar sequelize-cli** (solo la primera vez):
```bash
npm install
```

2. **Ejecutar migración** para crear la tabla:
```bash
npm run migrate
```

Esto creará la tabla `feature_flags` con los 3 switches iniciales en **`false`** (TESTING/DESACTIVADO).

---

## 🛡️ Seguridad

- Los switches están almacenados en PostgreSQL (Render)
- El API **NO requiere autenticación** actualmente (solo acceso interno)
- Se registra quién hizo cada cambio (`updated_by`)
- Se registra la fecha del último cambio (`updated_at`)

---

## 📊 Logs y Notificaciones

Cada servicio muestra en los logs y notificaciones de Google Chat el modo actual:

```
[Membership] Iniciando creación de membresías (Modo: PRODUCCIÓN)
[WorldOffice] Creando factura - Modo: TESTING
[WorldOffice] Emitiendo factura electrónica - Modo: PRODUCCIÓN
```

---

## 🔄 Fallback a Variables de Entorno

Si la base de datos no está disponible o el switch no existe, el sistema usa automáticamente el valor de `.env`:
- `FRAPP_MODO_PRODUCCION` → fallback para `MEMBERSHIPS_ENABLED`
- `WORLDOFFICE_MODO_PRODUCCION` → fallback para `WORLDOFFICE_INVOICE_ENABLED`
- `WORLDOFFICE_EMITIR_DIAN` → fallback para `WORLDOFFICE_DIAN_ENABLED`

---

## 📝 Notas Importantes

1. **NO requiere deploy**: Los cambios son inmediatos (máx. 10 seg)
2. **Persistentes**: Sobreviven a reinicios del servidor
3. **Auditables**: Se registra quién y cuándo cambió cada switch
4. **Independientes**: Cada switch controla una funcionalidad específica
5. **Safe by default**: Todos inician en `false` (modo seguro/testing)

---

## 🆘 Troubleshooting

### El cambio no se aplicó
- Espera 10 segundos (tiempo de caché)
- Verifica que el servidor esté corriendo
- Revisa los logs: `https://dashboard.render.com`

### Error al ejecutar toggle-switch.js
- Asegúrate de que el servidor esté en Render (no local)
- Verifica la URL en el script (línea 4)

### ¿Cómo saber qué está activo ahora?
```bash
node toggle-switch.js list
```

O desde tu navegador:
```
https://facturador-webhook-processor.onrender.com/api/feature-flags
```
