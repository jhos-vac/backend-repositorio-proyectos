import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "src/prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { loadJwtSecrets } from "./jwt.config";
import { JwtStrategy } from "./strategy/jwt.strategy";

@Module({
	controllers: [AuthController],
	providers: [AuthService, JwtStrategy],
	imports: [
		ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
		PrismaModule,
		PassportModule.register({ defaultStrategy: "jwt" }),
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				secret: loadJwtSecrets(configService).access,
				signOptions: { algorithm: "HS256" },
				verifyOptions: { algorithms: ["HS256"] },
			}),
		}),
	],
	exports: [AuthService, JwtStrategy, PassportModule, JwtModule],
})
export class AuthModule {}
