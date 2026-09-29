import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { ValidRoles } from "../enums/valid-roles.enum";
import { RoleProtected } from "./role-protected.decorator";

/**
 * Restringe el endpoint a los roles indicados. Sin argumentos = cualquier
 * usuario autenticado. La autenticación en sí la hace el JwtAuthGuard global
 * y los roles el RolesGuard global (ver AppModule).
 */
export function Auth(...roles: ValidRoles[]) {
	return applyDecorators(RoleProtected(...roles), ApiBearerAuth());
}
