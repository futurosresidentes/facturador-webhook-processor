-- Migración: Agregar campos de tracking de stages
-- Fecha: 2025-10-20
-- Descripción: Agrega campos para seguimiento de stages en webhooks

-- Agregar columnas para tracking de stages
ALTER TABLE webhooks
ADD COLUMN IF NOT EXISTS current_stage VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_completed_stage VARCHAR(100);

-- Crear índices para mejorar performance en consultas por stage
CREATE INDEX IF NOT EXISTS idx_webhooks_current_stage ON webhooks(current_stage);
CREATE INDEX IF NOT EXISTS idx_webhooks_last_completed_stage ON webhooks(last_completed_stage);

-- Agregar comentarios para documentación
COMMENT ON COLUMN webhooks.current_stage IS 'Stage actual en el que se encuentra el procesamiento';
COMMENT ON COLUMN webhooks.last_completed_stage IS 'Último stage completado exitosamente';

-- Actualizar webhooks existentes con estado completed
UPDATE webhooks
SET last_completed_stage = 'completed'
WHERE status = 'completed' AND last_completed_stage IS NULL;

-- Actualizar webhooks existentes con estado error
UPDATE webhooks
SET current_stage = 'error'
WHERE status = 'error' AND current_stage IS NULL;

-- Ver resumen de la migración
SELECT
  'Migración completada' as mensaje,
  COUNT(*) as total_webhooks,
  COUNT(CASE WHEN current_stage IS NOT NULL THEN 1 END) as con_current_stage,
  COUNT(CASE WHEN last_completed_stage IS NOT NULL THEN 1 END) as con_last_completed_stage
FROM webhooks;
