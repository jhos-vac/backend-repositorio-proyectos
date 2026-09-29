import { Type } from "class-transformer";
import {
	IsIn,
	Max,
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	MaxLength,
} from "class-validator";

export class PaginationDto {
	@IsOptional()
	@IsNumber()
	@IsPositive()
	@Type(() => Number)
	page?: number = 1;

	@IsOptional()
	@IsNumber()
	@IsPositive()
	@Max(50000)
	@Type(() => Number)
	limit?: number = 10;

	@IsOptional()
	@IsString()
	@IsIn(["asc", "desc"])
	order?: "asc" | "desc" = "desc";

	@IsOptional()
	@IsString()
	@IsIn(["createdAt", "updatedAt"])
	orderBy?: string = "createdAt";

	@IsOptional()
	@IsString()
	@MaxLength(100)
	search?: string;
}
