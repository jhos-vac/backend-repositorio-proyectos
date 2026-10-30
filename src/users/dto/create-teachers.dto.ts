import { ApiProperty } from "@nestjs/swagger";
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { CreateUserDto } from "./create-user.dto";

/** Carga masiva de docentes: se crean todos o ninguno. */
export class CreateTeachersDto {
    @ApiProperty({ type: [CreateUserDto], description: 'Docentes a registrar (máximo 200 por archivo)' })
    @IsArray()
    @ArrayMinSize(1, { message: 'El archivo no tiene docentes.' })
    @ArrayMaxSize(200, { message: 'Máximo 200 docentes por archivo.' })
    @ValidateNested({ each: true })
    @Type(() => CreateUserDto)
    teachers: CreateUserDto[];
}
