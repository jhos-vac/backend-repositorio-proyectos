-- BE-10: los documentos pueden guardarse en Google Drive (driveFileId) en lugar del disco (storedName).
ALTER TABLE "ProjectDocument" ALTER COLUMN "storedName" DROP NOT NULL;
ALTER TABLE "ProjectDocument" ADD COLUMN "driveFileId" TEXT;
CREATE UNIQUE INDEX "ProjectDocument_driveFileId_key" ON "ProjectDocument"("driveFileId");
