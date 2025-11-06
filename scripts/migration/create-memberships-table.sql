-- Crear tabla memberships para auditoría y debugging
-- Esta tabla guarda un registro local de las membresías creadas en Frapp

CREATE TABLE IF NOT EXISTS memberships (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    contact_id INTEGER,  -- ID del contacto en Frapp CRM (no FK porque contacts no existe localmente)
    membership_plan_id INTEGER NOT NULL,  -- ID del plan en FR360
    product VARCHAR(255),  -- Nombre del producto base
    activation_url TEXT,  -- URL de activación generada
    start_date TIMESTAMP,  -- Fecha de inicio
    expiry_date TIMESTAMP,  -- Fecha de expiración
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Crear índices para queries comunes
CREATE INDEX IF NOT EXISTS idx_memberships_webhook_id ON memberships(webhook_id);
CREATE INDEX IF NOT EXISTS idx_memberships_contact_id ON memberships(contact_id);
CREATE INDEX IF NOT EXISTS idx_memberships_plan_id ON memberships(membership_plan_id);

-- Verificar estructura
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'memberships'
ORDER BY ordinal_position;
