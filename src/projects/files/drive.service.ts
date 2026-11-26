import { Injectable, Logger } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

/**
 * BE-10: documentos en Google Drive (cuenta del instituto, p. ej. semillero@sudamericano.edu.ec).
 *
 * - La cuenta autoriza una sola vez (refresh token) con el permiso mínimo `drive.file`:
 *   el sistema solo ve y modifica los archivos que él mismo creó, nada más de ese Drive.
 * - Los PDF quedan en una carpeta propia del sistema (DRIVE_FOLDER_NAME) y son privados:
 *   se descargan siempre a través del backend, que aplica los permisos del proyecto.
 * - Sin DRIVE_CLIENT_ID / DRIVE_CLIENT_SECRET / DRIVE_REFRESH_TOKEN el sistema guarda en disco, como antes.
 *
 * DRIVE_API_URL y DRIVE_TOKEN_URL solo existen para las pruebas automáticas (Drive simulado).
 */
@Injectable()
export class DriveService {
  private readonly log = new Logger(DriveService.name);
  private client?: drive_v3.Drive;
  private folderId?: Promise<string>;

  get enabled(): boolean {
    return !!(process.env.DRIVE_CLIENT_ID && process.env.DRIVE_CLIENT_SECRET && process.env.DRIVE_REFRESH_TOKEN);
  }

  private drive(): drive_v3.Drive {
    if (!this.client) {
      const tokenUrl = process.env.DRIVE_TOKEN_URL;
      const auth = new google.auth.OAuth2({
        clientId: process.env.DRIVE_CLIENT_ID,
        clientSecret: process.env.DRIVE_CLIENT_SECRET,
        ...(tokenUrl ? { endpoints: { oauth2TokenUrl: tokenUrl } } : {}),
      });
      auth.setCredentials({ refresh_token: process.env.DRIVE_REFRESH_TOKEN });
      this.client = google.drive({ version: 'v3', auth });
    }
    return this.client;
  }

  /** Solo pruebas: URL del Drive simulado. Va en cada llamada porque la opción global no cambia la URL de subida. */
  private opts(): { rootUrl?: string } {
    const rootUrl = process.env.DRIVE_API_URL;
    return rootUrl ? { rootUrl } : {};
  }

  /** Carpeta del sistema: la busca (con drive.file solo aparecen las que creó el sistema) o la crea. */
  private folder(): Promise<string> {
    if (!this.folderId) {
      this.folderId = this.findOrCreateFolder().catch((e) => {
        this.folderId = undefined; // reintentar en la próxima subida
        throw e;
      });
    }
    return this.folderId;
  }

  private async findOrCreateFolder(): Promise<string> {
    const name = process.env.DRIVE_FOLDER_NAME || 'Sistema Semillero - Documentos';
    const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${name.replace(/['\\]/g, '\\$&')}' and trashed = false`;
    const found = await this.drive().files.list({ q, fields: 'files(id)', pageSize: 1, spaces: 'drive' }, this.opts());
    const existing = found.data.files?.[0]?.id;
    if (existing) return existing;
    const created = await this.drive().files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    }, this.opts());
    this.log.log(`Carpeta de documentos creada en Drive: "${name}" (${created.data.id})`);
    return created.data.id!;
  }

  /** Sube el PDF y devuelve el id del archivo en Drive. */
  async upload(buf: Buffer, name: string, sha256: string): Promise<string> {
    const res = await this.drive().files.create({
      requestBody: { name, parents: [await this.folder()], mimeType: 'application/pdf', appProperties: { sha256 } },
      media: { mimeType: 'application/pdf', body: Readable.from(buf) },
      fields: 'id',
    }, this.opts());
    return res.data.id!;
  }

  async download(fileId: string): Promise<Buffer> {
    const res = await this.drive().files.get({ fileId, alt: 'media' }, { ...this.opts(), responseType: 'arraybuffer' });
    return Buffer.from(res.data as ArrayBuffer);
  }

  /** A la papelera de Drive (se puede recuperar 30 días), no un borrado definitivo. */
  async remove(fileId: string): Promise<void> {
    try {
      await this.drive().files.update({ fileId, requestBody: { trashed: true } }, this.opts());
    } catch (e: any) {
      this.log.warn(`No se pudo mandar a la papelera el archivo ${fileId} de Drive: ${e?.message ?? e}`);
    }
  }
}
