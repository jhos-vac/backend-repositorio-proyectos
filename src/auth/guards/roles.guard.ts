import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { META_ROLES } from "../decorators/role-protected.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ValidRoles } from "../enums/valid-roles.enum";

/** Guard global: valida el rol del usuario contra @Auth(...roles). */
@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const targets = [context.getHandler(), context.getClass()];
		if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
			return true;
		}

		const roles = this.reflector.getAllAndOverride<ValidRoles[]>(
			META_ROLES,
			targets,
		);
		if (!roles || roles.length === 0) return true; // basta con estar autenticado

		const user = context.switchToHttp().getRequest().user;
		if (!user?.role?.name || !roles.includes(user.role.name as ValidRoles)) {
			throw new ForbiddenException("No tienes permisos para esta acción.");
		}
		return true;
	}
}
