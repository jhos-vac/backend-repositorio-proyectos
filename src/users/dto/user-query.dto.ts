import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginationDto } from 'src/Libs/common';

export class UserQueryDto extends PaginationDto {
  @IsOptional() @IsIn(['ADMIN', 'TEACHER', 'USER'])
  role?: 'ADMIN' | 'TEACHER' | 'USER';

  @IsOptional() @IsUUID()
  careerId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4)
  level?: number;
}
