import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  Max,
  Min,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
// IMPORTANTE: Asegúrate de que esta ruta coincida con donde creaste el validador

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty() 
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty() 
  description: string;

  @ApiProperty({ required: false, default: 'in-progress' })
  @IsOptional() 
  @IsString()
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString()
  problems?: string;
  
  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString()
  summary?: string;

  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString({ each: true })
  objectives?: string[];

  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString()
  cycle?: string;
  
  @ApiProperty({ required: false })
  @IsOptional() 
  @IsString()
  academic_period?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deliverables?: string[];



  @ApiProperty()
  @IsUUID()
  @IsNotEmpty() 
  careerId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  createdBy?: string;

  /** Solo lo usan docentes/admin; para estudiantes se toma de su perfil */
  @ApiProperty({ required: false, minimum: 1, maximum: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  level?: number;
}