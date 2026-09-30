import { ForbiddenException } from "@nestjs/common";
import { ValidRoles } from "src/auth/enums/valid-roles.enum";

type WithRole = { role?: { name?: string } };

export const isAdmin = (user: WithRole) => user?.role?.name === ValidRoles.ADMIN;
export const isTeacher = (user: WithRole) => user?.role?.name === ValidRoles.TEACHER;
export const isStudent = (user: WithRole) => user?.role?.name === ValidRoles.USER;

/** Permite solo al propio usuario o a un ADMIN. */
export function assertSelfOrAdmin(user: any, targetId: string) {
	if (user.id !== targetId && !isAdmin(user)) {
		throw new ForbiddenException("No tienes permisos para esta acción.");
	}
}
