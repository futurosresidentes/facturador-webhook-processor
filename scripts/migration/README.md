# 🚀 Migración de Render PostgreSQL a Supabase

Esta carpeta contiene los scripts necesarios para migrar tu base de datos desde Render a Supabase.

## 📋 Pasos de migración

### PASO 1: Crear proyecto en Supabase

1. Ve a https://supabase.com
2. Crea una cuenta (GitHub, Google, o email)
3. Crear nuevo proyecto:
   - **Project name**: `facturador-webhook-processor`
   - **Database password**: [Elige una contraseña segura]
   - **Region**: `South America (São Paulo)`
   - **Plan**: Free
4. Espera ~2 minutos a que se cree el proyecto

### PASO 2: Crear el schema en Supabase

1. En Supabase Dashboard, ve a **SQL Editor**
2. Copia el contenido de `1-export-schema.sql`
3. Pégalo en el editor y ejecuta (clic en "Run")
4. Verifica que se crearon las 3 tablas:
   - `webhooks`
   - `webhook_logs`
   - `feature_flags`

### PASO 3: Exportar datos desde Render

```bash
# Desde la raíz del proyecto
node scripts/migration/2-export-data.js
```

Esto creará la carpeta `exported_data/` con:
- `webhooks.json` - Todos tus webhooks
- `webhook_logs.json` - Todos los logs
- `feature_flags.json` - Todas las flags
- `summary.json` - Resumen de la exportación

### PASO 4: Obtener credenciales de Supabase

En Supabase Dashboard:

1. Ve a **Settings** > **API**
2. Copia:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...` (la key larga)

### PASO 5: Importar datos a Supabase

```bash
# Opción A: Con variables de entorno
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_KEY="eyJhbGc..."
node scripts/migration/3-import-to-supabase.js

# Opción B: Con parámetros
node scripts/migration/3-import-to-supabase.js "https://xxxxx.supabase.co" "eyJhbGc..."
```

### PASO 6: Verificar datos importados

1. En Supabase Dashboard, ve a **Table Editor**
2. Verifica que las tablas tienen datos:
   - `webhooks` → ~611 registros
   - `webhook_logs` → ~7,332 registros
   - `feature_flags` → 5 registros

### PASO 7: Obtener connection string de Supabase

En Supabase Dashboard:

1. Ve a **Settings** > **Database**
2. En **Connection string** selecciona **URI**
3. Copia la URL completa (reemplaza `[YOUR-PASSWORD]` con tu contraseña)

Formato:
```
postgresql://postgres.xxxxx:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

### PASO 8: Actualizar variables de entorno en Render

1. Ve a Render Dashboard → Tu servicio
2. Ve a **Environment**
3. Edita la variable `DATABASE_URL`
4. Pega el connection string de Supabase
5. **NO** guardes todavía

### PASO 9: Testing (opcional pero recomendado)

Antes de deployar a producción, puedes probar localmente:

1. Crea un archivo `.env.supabase` con:
   ```
   DATABASE_URL=postgresql://postgres.xxxxx:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```

2. Prueba la conexión:
   ```bash
   # Temporal: usar la nueva BD
   DATABASE_URL="postgresql://..." node scripts/check-webhook-468.js
   ```

### PASO 10: Deploy a producción

1. En Render Dashboard, guarda la variable `DATABASE_URL`
2. Render automáticamente redeployará
3. Monitorea los logs en Render para confirmar que conecta bien

### PASO 11: Verificación post-migración

1. Espera a que termine el deploy (~2 minutos)
2. Verifica que no hay errores en logs de Render
3. Prueba consultando un webhook via API:
   ```bash
   curl -H "Authorization: Bearer <token>" \
     "https://facturador-webhook-processor.onrender.com/api/webhooks?id=468"
   ```

## ✅ Migración completada

Una vez verificado:
- ✅ Ahorro: $84/año ($7/mes de Render)
- ✅ Espacio: 500 MB (suficiente por ~2 años)
- ✅ Dashboard visual para consultas
- ✅ Backups automáticos

## 🔄 Rollback (si algo sale mal)

Si algo falla, puedes volver a Render fácilmente:

1. En Render Dashboard → Environment
2. Restaura el valor anterior de `DATABASE_URL`
3. Guarda (redeploy automático)

## 📊 Archivos en esta carpeta

- `1-export-schema.sql` - Schema de las tablas (CREATE TABLE)
- `2-export-data.js` - Script para exportar datos de Render
- `3-import-to-supabase.js` - Script para importar a Supabase
- `exported_data/` - Carpeta con datos exportados (se crea al exportar)
- `README.md` - Este archivo

## ⚠️ Notas importantes

- Los cachés (ciudades, comerciales, productos) NO están en la BD → no afecta
- Las feature flags se pueden editar en Supabase Dashboard después
- El connection string tiene tu contraseña → guárdalo de forma segura
- Render cobra por día, desactiva la BD de Render después de migrar
