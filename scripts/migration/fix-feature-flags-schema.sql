-- Agregar columna faltante updated_by a feature_flags
ALTER TABLE feature_flags
ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

-- Verificar la estructura
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'feature_flags'
ORDER BY ordinal_position;
