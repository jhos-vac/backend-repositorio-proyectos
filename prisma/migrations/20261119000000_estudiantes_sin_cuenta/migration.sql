-- BE-08: los estudiantes dejan de ser usuarios (no inician sesión) y pasan a ser
-- registros que administra el docente. Proyecto: individual o grupal.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "modality" TEXT NOT NULL DEFAULT 'grupal';

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "group" TEXT,
    "academicPeriod" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStudent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStudent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");

-- CreateIndex
CREATE INDEX "Student_careerId_level_idx" ON "Student"("careerId", "level");

-- CreateIndex
CREATE INDEX "ProjectStudent_studentId_idx" ON "ProjectStudent"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStudent_projectId_studentId_key" ON "ProjectStudent"("projectId", "studentId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "Career"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStudent" ADD CONSTRAINT "ProjectStudent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStudent" ADD CONSTRAINT "ProjectStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===================================================================== datos
-- 1. Cada usuario con rol USER pasa a ser un estudiante (se conserva su id).
INSERT INTO "Student" ("id", "name", "email", "careerId", "level", "createdAt", "updatedAt")
SELECT u."id", u."name", u."email", u."careerId", COALESCE(u."level", 1), u."createdAt", CURRENT_TIMESTAMP
FROM "User" u JOIN "Role" r ON r."id" = u."roleId"
WHERE r."name" = 'USER';

-- 2. Los proyectos conservan a sus estudiantes: integrantes y creador.
INSERT INTO "ProjectStudent" ("id", "projectId", "studentId", "createdAt")
SELECT gen_random_uuid()::text, up."projectId", up."userId", up."createdAt"
FROM "UserProject" up JOIN "Student" s ON s."id" = up."userId"
ON CONFLICT ("projectId", "studentId") DO NOTHING;

INSERT INTO "ProjectStudent" ("id", "projectId", "studentId", "createdAt")
SELECT gen_random_uuid()::text, p."id", p."createdBy", p."createdAt"
FROM "Project" p JOIN "Student" s ON s."id" = p."createdBy"
ON CONFLICT ("projectId", "studentId") DO NOTHING;

-- 3. Los proyectos que creó un estudiante pasan al docente asignado a su carrera y nivel
--    (sin docente asignado quedan sin creador).
UPDATE "Project" p
SET "createdBy" = (
  SELECT ta."teacherId" FROM "TeacherAssignment" ta
  WHERE ta."careerId" = p."careerId" AND ta."level" = p."level"
  LIMIT 1
)
WHERE p."createdBy" IN (SELECT "id" FROM "Student");

-- 4. Modalidad: individual si tiene un solo estudiante; si no, grupal.
UPDATE "Project" p
SET "modality" = 'individual'
WHERE (SELECT count(*) FROM "ProjectStudent" ps WHERE ps."projectId" = p."id") = 1;

-- 5. Ya no hay revisión: lo pendiente o rechazado queda aprobado.
UPDATE "Project" SET "reviewStatus" = 'approved' WHERE "reviewStatus" <> 'approved';

-- 6. Se quitan las referencias a las cuentas de estudiantes y se borran.
DELETE FROM "UserProject" WHERE "userId" IN (SELECT "id" FROM "Student");
UPDATE "ProjectDocument" SET "uploadedById" = NULL WHERE "uploadedById" IN (SELECT "id" FROM "Student");
UPDATE "ProjectLink" SET "createdById" = NULL WHERE "createdById" IN (SELECT "id" FROM "Student");
UPDATE "Skills" SET "createdById" = NULL WHERE "createdById" IN (SELECT "id" FROM "Student");
UPDATE "Project" SET "reviewedById" = NULL WHERE "reviewedById" IN (SELECT "id" FROM "Student");
DELETE FROM "TeacherAssignment" WHERE "teacherId" IN (SELECT "id" FROM "Student");
DELETE FROM "User" WHERE "id" IN (SELECT "id" FROM "Student");
