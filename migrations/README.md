# Migraciones de Base de Datos

## Cómo ejecutar migraciones en Render

### Opción 1: Desde Render Dashboard (Recomendado)

1. Ve a tu servicio en Render Dashboard
2. Click en "Shell" en el menú lateral
3. Ejecuta:
```bash
psql $DATABASE_URL < migrations/20251022_add_payload_response_to_webhook_logs.sql
```

### Opción 2: Desde tu máquina local

Necesitas tener instalado `psql` y la variable de entorno `DATABASE_URL` configurada:

```bash
psql $DATABASE_URL < migrations/20251022_add_payload_response_to_webhook_logs.sql
```

### Opción 3: Copiar y pegar SQL

1. Abre el archivo SQL: `migrations/20251022_add_payload_response_to_webhook_logs.sql`
2. Copia todo el contenido
3. Conéctate a tu base de datos PostgreSQL
4. Pega y ejecuta el SQL

## Migraciones disponibles

### 20251022_add_payload_response_to_webhook_logs.sql

**Descripción**: Agrega campos `request_payload` y `response_data` a la tabla `webhook_processing_logs` para almacenar detalles de cada llamado API.

**Cambios**:
- Agrega columna `request_payload` (JSONB)
- Agrega columna `response_data` (JSONB)
- Crea índices GIN para búsquedas eficientes
- Agrega comentarios de documentación

**Requisitos**: PostgreSQL 9.4+

**Reversible**: Sí
```sql
ALTER TABLE webhook_processing_logs
DROP COLUMN IF EXISTS request_payload,
DROP COLUMN IF EXISTS response_data;
```

## Verificar migración

Después de ejecutar la migración, verifica:

```sql
-- Ver estructura de la tabla
\d webhook_processing_logs

-- Verificar que las columnas existen
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'webhook_processing_logs'
AND column_name IN ('request_payload', 'response_data');

-- Verificar índices
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'webhook_processing_logs';
```

## Notas importantes

- ⚠️ **SIEMPRE** ejecuta migraciones en un entorno de prueba primero
- ⚠️ Las columnas son `JSONB` (no `JSON`) para mejor performance
- ⚠️ Los índices GIN pueden tardar unos segundos en crearse en tablas grandes
- ✅ Las migraciones son idempotentes (`IF NOT EXISTS`)
- ✅ No afectan datos existentes (solo agregan columnas)
