-- Período activo: solo uno a la vez (lo cambia el ADMIN)
ALTER TABLE "Period" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Period_single_active" ON "Period" ("active") WHERE "active";

-- Si hay períodos, se activa el más reciente para no dejar el sistema sin período en curso
UPDATE "Period" SET "active" = true WHERE "id" = (
  SELECT "id" FROM "Period" ORDER BY "startYear" DESC NULLS LAST, "startMonth" DESC NULLS LAST, "createdAt" DESC LIMIT 1
);

-- Estudiantes del SGA: se identifican por cédula; el correo pasa a ser opcional
ALTER TABLE "Student" ADD COLUMN "cedula" TEXT;
CREATE UNIQUE INDEX "Student_cedula_key" ON "Student"("cedula");
ALTER TABLE "Student" ALTER COLUMN "email" DROP NOT NULL;
