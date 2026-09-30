import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProjectsService } from '../projects.service';
import { ClamavService } from './clamav.service';
import { CreateLinkDto } from './project-files.dto';
import { docPath, docsDir, unlinkQuiet } from './storage';

type AuthUser = { id: string; careerId: string; level?: number | null; role?: { name?: string } };

export const MAX_PDF_BYTES = (Number(process.env.MAX_PDF_MB) || 20) * 1024 * 1024;
const MAX_DOCS = 10;
const MAX_LINKS = 10;
const REPO_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];

@Injectable()
export class ProjectFilesService {
  private readonly log = new Logger(ProjectFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly clam: ClamavService,
  ) {}

  // ------------------------------------------------------------ permisos

  /** Proyecto visible para el usuario + regla de gestión de archivos/enlaces. */
  private async forManage(id: string, user: AuthUser) {
    const project: any = await this.projects.findOne(id, user);
    this.projects.assertCanManageFiles(project, user);
    return project;
  }

  // ------------------------------------------------------------ documentos

  async listDocuments(id: string, user: AuthUser) {
    await this.projects.findOne(id, user); // visibilidad del proyecto
    return this.prisma.project.findUnique({ where: { id } }).documents({
      select: { id: true, kind: true, originalName: true, size: true, sha256: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private cleanName(raw: string) {
    let n = Buffer.from(raw || 'documento.pdf', 'latin1').toString('utf8'); // multer entrega latin1
    n = n.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
    if (!n) n = 'documento.pdf';
    if (!/\.pdf$/i.test(n)) n += '.pdf';
    return n.slice(-150);
  }

  async upload(id: string, file: Express.Multer.File | undefined, kind: string | undefined, user: AuthUser) {
    if (!file) throw new BadRequestException('Adjunta un archivo PDF en el campo "file".');
    const project: any = await this.forManage(id, user);

    const buf = file.buffer;
    if (buf.length === 0) throw new BadRequestException('El archivo está vacío.');
    if (buf.length > MAX_PDF_BYTES) throw new BadRequestException(`El archivo supera el máximo de ${MAX_PDF_BYTES / 1024 / 1024} MB.`);
    // Contenido real: cabecera %PDF- al inicio y marca %%EOF al final (no basta la extensión ni el mimetype)
    const tail = buf.subarray(Math.max(0, buf.length - 4096)).toString('latin1');
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-' || !tail.includes('%%EOF')) {
      throw new BadRequestException('El archivo no es un PDF válido.');
    }

    if ((await this.prisma.projectDocument.count({ where: { projectId: id } })) >= MAX_DOCS) {
      throw new ConflictException(`Un proyecto admite hasta ${MAX_DOCS} documentos.`);
    }
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const dup = await this.prisma.projectDocument.findUnique({ where: { projectId_sha256: { projectId: id, sha256 } } });
    if (dup) throw new ConflictException(`Este archivo ya está adjunto («${dup.originalName}»).`);

    await this.clam.assertClean(buf);

    const storedName = `${randomUUID()}.pdf`;
    await fs.mkdir(docsDir(), { recursive: true, mode: 0o750 });
    await fs.writeFile(docPath(storedName), buf, { flag: 'wx', mode: 0o640 });
    try {
      const doc = await this.prisma.projectDocument.create({
        data: {
          projectId: project.id, kind: kind ?? 'otro', originalName: this.cleanName(file.originalname),
          storedName, size: buf.length, sha256, uploadedById: user.id,
        },
        select: { id: true, kind: true, originalName: true, size: true, sha256: true, createdAt: true },
      });
      return doc;
    } catch (e) {
      await unlinkQuiet(storedName);
      throw e;
    }
  }

  /** Devuelve el archivo verificando su huella: si cambió en disco, no se entrega. */
  async download(id: string, docId: string, user: AuthUser) {
    await this.projects.findOne(id, user);
    const doc = await this.prisma.projectDocument.findFirst({ where: { id: docId, projectId: id } });
    if (!doc) throw new NotFoundException('Documento no encontrado.');
    let buf: Buffer;
    try {
      buf = await fs.readFile(docPath(doc.storedName));
    } catch {
      this.log.error(`Archivo faltante en disco: ${doc.storedName}`);
      throw new NotFoundException('El archivo ya no está disponible en el servidor.');
    }
    if (createHash('sha256').update(buf).digest('hex') !== doc.sha256) {
      this.log.error(`INTEGRIDAD: la huella de ${doc.storedName} no coincide`);
      throw new InternalServerErrorException('El archivo no pasó la verificación de integridad.');
    }
    return { doc, buf };
  }

  async removeDocument(id: string, docId: string, user: AuthUser) {
    await this.forManage(id, user);
    const doc = await this.prisma.projectDocument.findFirst({ where: { id: docId, projectId: id } });
    if (!doc) throw new NotFoundException('Documento no encontrado.');
    await this.prisma.projectDocument.delete({ where: { id: doc.id } });
    await unlinkQuiet(doc.storedName);
    return { deleted: true };
  }

  // ------------------------------------------------------------ enlaces

  async listLinks(id: string, user: AuthUser) {
    await this.projects.findOne(id, user);
    return this.prisma.projectLink.findMany({
      where: { projectId: id },
      orderBy: [{ isFinal: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, type: true, label: true, url: true, ref: true, isFinal: true, createdAt: true },
    });
  }

  private validateUrl(dto: CreateLinkDto) {
    let u: URL;
    try { u = new URL(dto.url); } catch { throw new BadRequestException('El enlace no es una URL válida.'); }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (u.protocol !== 'https:') throw new BadRequestException('Solo se permiten enlaces https.');
    if (u.username || u.password) throw new BadRequestException('El enlace no puede incluir credenciales.');
    if (u.port && u.port !== '443') throw new BadRequestException('El enlace no puede usar un puerto especial.');
    if (host === 'localhost' || !host.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || /\.(local|internal|localhost)$/.test(host)) {
      throw new BadRequestException('El enlace debe apuntar a un sitio público.');
    }
    if (dto.type === 'repositorio') {
      if (!REPO_HOSTS.includes(host)) throw new BadRequestException('El repositorio debe estar en GitHub, GitLab o Bitbucket.');
      if (u.pathname.split('/').filter(Boolean).length < 2) throw new BadRequestException('Indica el repositorio completo (usuario/repositorio).');
    }
    u.hash = '';
    return u.toString();
  }

  async addLink(id: string, dto: CreateLinkDto, user: AuthUser) {
    await this.forManage(id, user);
    const url = this.validateUrl(dto);
    if ((await this.prisma.projectLink.count({ where: { projectId: id } })) >= MAX_LINKS) {
      throw new ConflictException(`Un proyecto admite hasta ${MAX_LINKS} enlaces.`);
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.isFinal) await tx.projectLink.updateMany({ where: { projectId: id }, data: { isFinal: false } });
      return tx.projectLink.create({
        data: { projectId: id, type: dto.type, url, label: dto.label?.trim() || null, ref: dto.ref || null, isFinal: !!dto.isFinal, createdById: user.id },
        select: { id: true, type: true, label: true, url: true, ref: true, isFinal: true, createdAt: true },
      });
    });
  }

  async removeLink(id: string, linkId: string, user: AuthUser) {
    await this.forManage(id, user);
    const link = await this.prisma.projectLink.findFirst({ where: { id: linkId, projectId: id } });
    if (!link) throw new NotFoundException('Enlace no encontrado.');
    await this.prisma.projectLink.delete({ where: { id: link.id } });
    return { deleted: true };
  }
}
