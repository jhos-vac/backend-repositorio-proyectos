import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CreateUserDto } from "src/users/dto/create-user.dto";
import { UserModel as User } from "src/prisma/generated/models/User";
import { AuthService } from "./auth.service";
import { Auth, GetUser, Public } from "./decorators";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/loginDto";
import { RefreshDto } from "./dto/refreshDto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ValidRoles } from "./enums/valid-roles.enum";

const MINUTE = 60_000;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
    constructor(private authService: AuthService) {}

    /** Login: público, limitado a 5 intentos por minuto y por IP. */
    @Public()
    @Throttle({ default: { limit: 5, ttl: MINUTE } })
    @HttpCode(HttpStatus.OK)
    @Post("login")
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    /** Registro público (pendiente de reemplazar por invitaciones, RN-01). */
    @Public()
    @Throttle({ default: { limit: 5, ttl: MINUTE } })
    @Post("register")
    register(@Body() createUserDto: CreateUserDto) {
        return this.authService.register(createUserDto);
    }

    /** Crea usuarios con cualquier rol: solo ADMIN. */
    @Auth(ValidRoles.ADMIN)
    @Post("register-admin")
    registeradmin(@Body() createUserDto: CreateUserDto) {
        return this.authService.registerAdmin(createUserDto);
    }

    /** Renueva tokens con el refresh token (público: no hay access válido). */
    @Public()
    @Throttle({ default: { limit: 20, ttl: MINUTE } })
    @HttpCode(HttpStatus.OK)
    @Post("refresh-token")
    refreshToken(@Body() refreshDto: RefreshDto) {
        return this.authService.refreshToken(refreshDto);
    }

    /** Cierra todas las sesiones del usuario autenticado. */
    @Auth()
    @HttpCode(HttpStatus.OK)
    @Post("logout")
    logout(@GetUser() user: User) {
        return this.authService.logout(user.id);
    }

    @Public()
    @Throttle({ default: { limit: 3, ttl: MINUTE } })
    @HttpCode(HttpStatus.OK)
    @Post("forgot-password")
    forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto.email);
    }

    @Public()
    @Throttle({ default: { limit: 5, ttl: MINUTE } })
    @HttpCode(HttpStatus.OK)
    @Post("reset-password/:token")
    resetPassword(@Param("token") token: string, @Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(token, dto.password);
    }
}
