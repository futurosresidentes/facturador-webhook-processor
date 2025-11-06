-- Crear tabla contacts para guardar cache local de contactos de Frapp CRM
-- Esta tabla permite debugging y auditoría sin consultar la API constantemente

CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    crm_id VARCHAR(100) UNIQUE,  -- ID del contacto en Frapp CRM
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    phone VARCHAR(50),
    identity_document VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Crear índices para queries comunes
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_crm_id ON contacts(crm_id);

-- Verificar estructura
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'contacts'
ORDER BY ordinal_position;
