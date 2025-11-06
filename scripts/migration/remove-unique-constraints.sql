-- Eliminar constraints UNIQUE que puedan existir en ref_payco
-- Estos constraints pueden haberse creado automáticamente por Sequelize

-- 1. Listar todos los constraints en la tabla webhooks
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'webhooks'::regclass;

-- 2. Eliminar constraint único de ref_payco si existe
-- (El nombre puede variar, ajusta según el resultado del SELECT anterior)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Buscar constraint UNIQUE en ref_payco
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'webhooks'::regclass
      AND contype = 'u'  -- unique constraint
      AND pg_get_constraintdef(oid) LIKE '%ref_payco%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE webhooks DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Constraint % eliminado', constraint_name;
    ELSE
        RAISE NOTICE 'No se encontró constraint UNIQUE en ref_payco';
    END IF;
END $$;

-- 3. Verificar que solo quede el PRIMARY KEY
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'webhooks'::regclass;
