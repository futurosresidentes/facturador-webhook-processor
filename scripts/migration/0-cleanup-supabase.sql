-- =====================================================
-- LIMPIAR TABLAS en Supabase (para re-importar)
-- =====================================================
-- IMPORTANTE: Solo ejecuta esto si necesitas re-importar los datos
-- Esto borrará TODOS los datos existentes en las tablas

-- 1. Borrar todos los logs (primero por la foreign key)
DELETE FROM webhook_logs;

-- 2. Borrar todos los webhooks
DELETE FROM webhooks;

-- 3. Reiniciar las secuencias de IDs (para que coincidan con los datos importados)
ALTER SEQUENCE webhooks_id_seq RESTART WITH 1;
ALTER SEQUENCE webhook_logs_id_seq RESTART WITH 1;

-- 4. Feature flags NO se borran (ya están correctas)
-- Si necesitas actualizarlas, usa el Table Editor de Supabase

-- Verificar que las tablas están vacías
SELECT COUNT(*) as webhooks_count FROM webhooks;
SELECT COUNT(*) as logs_count FROM webhook_logs;
SELECT COUNT(*) as flags_count FROM feature_flags;
