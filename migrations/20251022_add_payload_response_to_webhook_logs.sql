-- Agregar columnas request_payload y response_data a webhook_processing_logs
-- Estas columnas permitirán almacenar el detalle de cada llamado API para debugging

ALTER TABLE webhook_processing_logs
ADD COLUMN IF NOT EXISTS request_payload JSONB,
ADD COLUMN IF NOT EXISTS response_data JSONB;

-- Crear índices para búsquedas eficientes en campos JSONB
CREATE INDEX IF NOT EXISTS idx_webhook_logs_request_payload ON webhook_processing_logs USING GIN (request_payload);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_response_data ON webhook_processing_logs USING GIN (response_data);

-- Comentarios para documentación
COMMENT ON COLUMN webhook_processing_logs.request_payload IS 'Payload enviado en la petición API (cuando aplique)';
COMMENT ON COLUMN webhook_processing_logs.response_data IS 'Respuesta recibida de la API (cuando aplique)';
