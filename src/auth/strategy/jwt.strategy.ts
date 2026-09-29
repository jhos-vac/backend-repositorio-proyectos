import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { USER_OMIT } from "src/common/sanitize";
import { PrismaService } from "src/prisma/prisma.service";
import { loadJwtSecrets } from "../jwt.config";
import { JwtPayload } from "../interfaces/jwt-payload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(
		private prisma: PrismaService,
		configService: ConfigService,
	) {
		super({
			secretOrKey: loadJwtSecrets(configService).access,
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			algorithms: ["HS256"],
		});
	}

	async validate(payload: JwtPayload) {
		if (payload?.typ !== "access" || !payload.sub) {
			throw new UnauthorizedException("Token no válido");
		}

		// Se consulta el usuario en cada request: así un usuario borrado o con
		// sesiones revocadas (tokenVersion distinto) pierde acceso de inmediato.
		const user = await this.prisma.user.findUnique({
			where: { id: payload.sub },
			include: { role: true, career: true },
			omit: { ...USER_OMIT, tokenVersion: false },
		});

		if (!user || user.tokenVersion !== payload.tv) {
			throw new UnauthorizedException("Token no válido");
		}

		const { tokenVersion: _tv, ...safeUser } = user;
		return safeUser;
	}
}
