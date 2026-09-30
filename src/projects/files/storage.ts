import { join } from 'path';
import { promises as fs } from 'fs';

/** Carpeta privada de documentos: NO está bajo /uploads (que es público). */
export const docsDir = () => process.env.DOCS_DIR || join(process.cwd(), 'storage', 'documents');

/** Ruta segura: el nombre guardado es un UUID generado por el servidor, nunca del cliente. */
export const docPath = (storedName: string) => {
  if (!/^[0-9a-f-]{36}\.pdf$/.test(storedName)) throw new Error('Nombre de archivo inválido');
  return join(docsDir(), storedName);
};

export const unlinkQuiet = (storedName: string) => fs.unlink(docPath(storedName)).catch(() => undefined);
