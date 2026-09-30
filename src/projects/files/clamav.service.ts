import { Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import * as net from 'net';

/**
 * Antivirus opcional (ClamAV, protocolo INSTREAM por TCP).
 * Se activa con CLAMAV_HOST (y CLAMAV_PORT, por defecto 3310). Sin CLAMAV_HOST no escanea.
 * Si está activado y el escáner no responde, se RECHAZA la subida (falla cerrado).
 */
@Injectable()
export class ClamavService {
  private readonly log = new Logger(ClamavService.name);

  get enabled() {
    return !!process.env.CLAMAV_HOST;
  }

  async assertClean(buf: Buffer): Promise<void> {
    if (!this.enabled) return;
    const reply = await this.instream(buf);
    if (/FOUND\s*$/.test(reply)) {
      this.log.warn(`Archivo rechazado por antivirus: ${reply}`);
      throw new UnprocessableEntityException('El antivirus detectó contenido malicioso en el archivo.');
    }
    if (!/OK\s*$/.test(reply)) {
      this.log.error(`Respuesta inesperada de ClamAV: ${reply}`);
      throw new ServiceUnavailableException('No se pudo verificar el archivo con el antivirus. Inténtalo más tarde.');
    }
  }

  private instream(buf: Buffer): Promise<string> {
    const host = process.env.CLAMAV_HOST!;
    const port = Number(process.env.CLAMAV_PORT || 3310);
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port });
      let out = '';
      const fail = (e: Error) => {
        sock.destroy();
        this.log.error(`ClamAV no disponible: ${e.message}`);
        reject(new ServiceUnavailableException('El antivirus no está disponible. Inténtalo más tarde.'));
      };
      sock.setTimeout(30000, () => fail(new Error('timeout')));
      sock.on('error', fail);
      sock.on('data', (d) => (out += d.toString()));
      sock.on('end', () => resolve(out.replace(/\0/g, '').trim()));
      sock.on('connect', () => {
        sock.write('zINSTREAM\0');
        const CH = 64 * 1024;
        for (let i = 0; i < buf.length; i += CH) {
          const part = buf.subarray(i, i + CH);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(part.length);
          sock.write(len);
          sock.write(part);
        }
        sock.write(Buffer.alloc(4)); // fin del stream
      });
    });
  }
}
