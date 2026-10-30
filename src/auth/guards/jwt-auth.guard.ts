import { ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ALLOW_PENDING_PASSWORD_KEY } from "../decorators/allow-pending-password.decorator";

/**
 * Guard global: exige JWT de acceso salvo en endpoints @Public().
 * Si el usuario tiene pendiente el cambio de clave, solo puede usar los
 * endpoints marcados con @AllowPendingPassword().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
	constructor(private readonly reflector: Reflector) {
		super();
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const targets = [context.getHandler(), context.getClass()];
		if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

		const ok = (await super.canActivate(context)) as boolean;
		if (!ok) return false;

		const user = context.switchToHttp().getRequest().user;
		const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, targets);
		if (user?.needsPasswordChange && !allowPending) {
			throw new ForbiddenException({
				statusCode: 403,
				error: "PASSWORD_CHANGE_REQUIRED",
				message: "Debes cambiar tu contraseña antes de continuar.",
			});
		}
		return true;
	}
}
