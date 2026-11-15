-- Estado de avance unificado: solo 'en progreso' o 'completado'.
-- Antes convivían 'in-progress' (valor por defecto del backend), 'en progreso',
-- 'completado', 'Finalizado' y otros. Lo terminado pasa a 'completado' y el resto
-- a 'en progreso' (el estado "pendiente" de revisión vive en reviewStatus).
UPDATE "Project"
SET "status" = CASE WHEN "status" ~* '(complet|finaliz)' THEN 'completado' ELSE 'en progreso' END
WHERE "status" NOT IN ('en progreso', 'completado');

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'en progreso';
