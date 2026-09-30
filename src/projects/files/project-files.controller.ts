import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth, GetUser } from 'src/auth/decorators';
import { UserModel as User } from 'src/prisma/generated/models/User';
import { MAX_PDF_BYTES, ProjectFilesService } from './project-files.service';
import { CreateLinkDto, UploadDocumentDto } from './project-files.dto';

/** PDF y enlaces externos de un proyecto. Las reglas de acceso viven en el servicio. */
@ApiTags('Project files')
@Controller('projects/:id')
export class ProjectFilesController {
  constructor(private readonly files: ProjectFilesService) {}

  @Get('documents')
  @Auth()
  list(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.files.listDocuments(id, user as any);
  }

  @Post('documents')
  @Auth()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: 1 } }))
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @GetUser() user: User,
  ) {
    return this.files.upload(id, file, dto.kind, user as any);
  }

  @Get('documents/:docId/download')
  @Auth()
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Query('inline') inline: string | undefined,
    @GetUser() user: User,
    @Res() res: Response,
  ) {
    const { doc, buf } = await this.files.download(id, docId, user as any);
    const name = encodeURIComponent(doc.originalName).replace(/['()]/g, escape);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(buf.length),
      'Content-Disposition': `${inline === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.end(buf);
  }

  @Delete('documents/:docId')
  @Auth()
  removeDocument(@Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string, @GetUser() user: User) {
    return this.files.removeDocument(id, docId, user as any);
  }

  @Get('links')
  @Auth()
  listLinks(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.files.listLinks(id, user as any);
  }

  @Post('links')
  @Auth()
  addLink(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLinkDto, @GetUser() user: User) {
    return this.files.addLink(id, dto, user as any);
  }

  @Delete('links/:linkId')
  @Auth()
  removeLink(@Param('id', ParseUUIDPipe) id: string, @Param('linkId', ParseUUIDPipe) linkId: string, @GetUser() user: User) {
    return this.files.removeLink(id, linkId, user as any);
  }
}
