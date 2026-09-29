import { ForbiddenException } from "@nestjs/common";
import { ValidRoles } from "src/auth/enums/valid-roles.enum";

export const isAdmin = (user: { role?: { name?: string } }) =>
	user?.role?.name === ValidRoles.ADMIN;

/** Permite solo al propio usuario o a un ADMIN. */
export function assertSelfOrAdmin(user: any, targetId: string) {
	if (user.id !== targetId && !isAdmin(user)) {
		throw new ForbiddenException("No tienes permisos para esta acción.");
	}
}
