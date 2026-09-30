import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/** Integrantes del proyecto (estudiantes de la misma carrera). El creador siempre se conserva. */
export class MembersProjectDto {
  @IsArray()
  @ArrayMaxSize(8, { message: 'Un proyecto admite hasta 8 integrantes.' })
  @IsUUID('all', { each: true })
  userIds: string[];
}
