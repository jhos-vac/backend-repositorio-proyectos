import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { AuthModule } from 'src/auth/auth.module';
import { ProjectFilesController } from './files/project-files.controller';
import { ProjectFilesService } from './files/project-files.service';
import { ClamavService } from './files/clamav.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  controllers: [ProjectsController, ProjectFilesController],
  providers: [ProjectsService, ProjectFilesService, ClamavService],
  imports: [AuthModule, PrismaModule]
})
export class ProjectsModule {}
