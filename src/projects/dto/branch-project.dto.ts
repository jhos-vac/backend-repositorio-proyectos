import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BranchProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}
