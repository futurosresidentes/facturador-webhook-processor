-- =====================================================
-- SCHEMA EXPORT para Supabase
-- Basado en la estructura actual de Render PostgreSQL
-- =====================================================

-- Tabla: webhooks
CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY,
    ref_payco VARCHAR(255) NOT NULL,
    transaction_id VARCHAR(255),
    invoice_id VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),
    customer_city VARCHAR(255),
    customer_address TEXT,
    product TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'COP',
    response VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    current_stage VARCHAR(100),
    last_completed_stage VARCHAR(100),
    processing_context JSONB DEFAULT '{}',
    completed_stages TEXT[] DEFAULT ARRAY[]::TEXT[],
    failed_stage VARCHAR(100),
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    is_retriable BOOLEAN DEFAULT true,
    error_message TEXT,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para webhooks
CREATE INDEX IF NOT EXISTS idx_webhooks_ref_payco ON webhooks(ref_payco);
CREATE INDEX IF NOT EXISTS idx_webhooks_invoice_id ON webhooks(invoice_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);
CREATE INDEX IF NOT EXISTS idx_webhooks_created_at ON webhooks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhooks_customer_email ON webhooks(customer_email);

-- Tabla: webhook_logs
CREATE TABLE IF NOT EXISTS webhook_logs (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    stage VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    details TEXT,
    request_payload JSONB,
    response_data JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para webhook_logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_stage ON webhook_logs(stage);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- Tabla: feature_flags
CREATE TABLE IF NOT EXISTS feature_flags (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para feature_flags
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);

-- Insertar feature flags por defecto
INSERT INTO feature_flags (key, value, description) VALUES
    ('WORLDOFFICE_INVOICE_ENABLED', true, 'Activar creación de facturas en World Office (true=PRODUCCIÓN, false=TESTING)'),
    ('WORLDOFFICE_ACCOUNTING_ENABLED', true, 'Activar contabilización de facturas en World Office'),
    ('WORLDOFFICE_DIAN_ENABLED', false, 'Activar emisión electrónica ante la DIAN en World Office'),
    ('FRAPP_MEMBERSHIP_ENABLED', true, 'Activar creación de membresías en Frapp'),
    ('STRAPI_FACTURACION_ENABLED', true, 'Activar registro de facturaciones en Strapi')
ON CONFLICT (key) DO NOTHING;

-- Comentarios para documentación
COMMENT ON TABLE webhooks IS 'Registro de webhooks recibidos de ePayco con estado de procesamiento';
COMMENT ON TABLE webhook_logs IS 'Logs detallados de cada stage del procesamiento de webhooks';
COMMENT ON TABLE feature_flags IS 'Configuración dinámica de features del sistema';

COMMENT ON COLUMN webhooks.processing_context IS 'Datos guardados en checkpoints para retry sin duplicación';
COMMENT ON COLUMN webhooks.completed_stages IS 'Array de stages completados exitosamente';
COMMENT ON COLUMN webhooks.raw_data IS 'Payload completo recibido de ePayco';
