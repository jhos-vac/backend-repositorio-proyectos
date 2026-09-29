import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt"; 
import { CreateUserDto } from "src/users/dto/create-user.dto";
import { PrismaService } from "src/prisma/prisma.service";
import { LoginDto } from "./dto/loginDto";
import { RefreshDto } from "./dto/refreshDto";
import { JwtPayload, TokenType } from "./interfaces/jwt-payload.interface";
import { ACCESS_TTL, REFRESH_TTL, loadJwtSecrets } from "./jwt.config";
import { USER_OMIT } from "src/common/sanitize";
import * as crypto from 'crypto'; 
import { google } from 'googleapis'; 

@Injectable()
export class AuthService {
  private oauth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get('MAIL_CLIENT_ID'),
      this.configService.get('MAIL_CLIENT_SECRET'),
      'https://developers.google.com/oauthplayground'
    );

    this.oauth2Client.setCredentials({
      refresh_token: this.configService.get('MAIL_REFRESH_TOKEN')
    });
  }

  private isDomainAllowed(email: string): boolean {
    const domain = (email.split('@')[1] ?? '').toLowerCase();
    const allowedDomains = ['sudamericano.edu.ec', 'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com'];
    const allowedExtensions = ['.edu.ec', '.gob.ec', '.org.ec', '.com.ec', '.net.ec', '.ec', '.com', '.edu'];
    return allowedDomains.includes(domain) || allowedExtensions.some(ext => domain.endsWith(ext));
  }

  private readonly logger = new Logger(AuthService.name);
  // Hash de descarte: se compara siempre para que el tiempo de respuesta no
  // revele si el correo existe.
  private readonly dummyHash = bcrypt.hashSync("dummy-password-for-timing", 12);

  issueTokens(user: { id: string; tokenVersion: number }) {
    return this.signTokens(user);
  }

  private signTokens(user: { id: string; tokenVersion: number }) {
    const { access, refresh } = loadJwtSecrets(this.configService);
    const mk = (typ: TokenType, secret: string, expiresIn: string) =>
      this.jwtService.sign(
        { sub: user.id, typ, tv: user.tokenVersion } satisfies JwtPayload,
        { secret, expiresIn: expiresIn as any, algorithm: "HS256" },
      );
    return {
      accessToken: mk("access", access, ACCESS_TTL),
      refreshToken: mk("refresh", refresh, REFRESH_TTL),
    };
  }

  /** Invalida todos los tokens emitidos para el usuario. */
  private async revokeTokens(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async register(createUserDto: CreateUserDto) {
    try {
      const { password, email, roleId: _, ...userDto } = createUserDto;
      if (!this.isDomainAllowed(email)) throw new BadRequestException('Dominio de correo no permitido.');

      const role = await this.prisma.role.findFirst({ where: { name: 'USER' } });
      if (!role) throw new InternalServerErrorException("Error: El rol 'USER' no existe.");

      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await this.prisma.user.create({
        data: { ...userDto, email: email.toLowerCase(), password: hashedPassword, roleId: role.id },
        omit: USER_OMIT,
      });
      const tokens = this.signTokens({ id: user.id, tokenVersion: 0 });
      return { user, token: tokens.accessToken, ...tokens };
    } catch (error) { this.handleDBErrors(error); }
  }

  async registerAdmin(createUserDto: CreateUserDto) {
    try {
      const { password, email, roleId, ...userDto } = createUserDto;
      if (!roleId) throw new BadRequestException("El roleId es obligatorio.");
      const role = await this.prisma.role.findUnique({ where: { id: roleId } });
      if (!role) throw new BadRequestException("El rol indicado no existe.");

      const hashedPassword = await bcrypt.hash(password, 12);
      return await this.prisma.user.create({
        data: { ...userDto, email: email.toLowerCase(), password: hashedPassword, roleId },
        include: { role: true },
        omit: USER_OMIT,
      });
    } catch (error) { this.handleDBErrors(error); }
  }

  async login(loginDto: LoginDto) {
    const { password, email } = loginDto;
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { role: true } });
    const valid = await bcrypt.compare(password, user?.password ?? this.dummyHash);
    if (!user || !valid) throw new UnauthorizedException("Credenciales incorrectas");

    return {
      userId: user.id,
      userRole: user.role.name,
      userName: user.name,
      needsPasswordChange: user.needsPasswordChange,
      ...this.signTokens(user),
    };
  }

  async refreshToken(refreshDto: RefreshDto) {
    const invalid = new UnauthorizedException("Sesión expirada");
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshDto.refreshToken, {
        secret: loadJwtSecrets(this.configService).refresh,
        algorithms: ["HS256"],
      });
    } catch { throw invalid; }
    if (payload.typ !== "refresh" || !payload.sub) throw invalid;

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
    if (!user || user.tokenVersion !== payload.tv) throw invalid;

    return {
      userId: user.id,
      userRole: user.role.name,
      needsPasswordChange: user.needsPasswordChange,
      ...this.signTokens(user),
    };
  }

  /** Cierra todas las sesiones del usuario (revoca access y refresh). */
  async logout(userId: string) {
    await this.revokeTokens(userId);
    return { message: "Sesión cerrada" };
  }

  private makeBody(to: string, from: string, subject: string, message: string) {
    const str = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      message
    ].join('\n');

    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async forgotPassword(email: string) {
    // Respuesta idéntica exista o no el correo (evita enumeración de usuarios).
    const generic = { message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' };
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return generic;

    // El token en claro solo viaja por correo; en BD se guarda su hash.
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: this.hashToken(resetToken), resetTokenExpiry },
    });

    try {
      const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      const emailBody = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #0056b3;">Recuperación de Contraseña</h2>
          <p>Hola <strong>${this.escapeHtml(user.name)}</strong>,</p>
          <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
          <a href="${resetUrl}" style="background-color: #0056b3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0;">Restablecer Contraseña</a>
          <p style="color:#666;font-size:12px">El enlace vence en 1 hora. Si no fuiste tú, ignora este correo.</p>
        </div>
      `;
      const raw = this.makeBody(
        user.email,
        `"Soporte Tesis" <${this.configService.get('MAIL_USER')}>`,
        'Recuperación de Contraseña',
        emailBody,
      );
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    } catch (error) {
      // Se registra internamente, pero no se revela al cliente.
      this.logger.error(`No se pudo enviar el correo de recuperación: ${(error as Error).message}`);
    }
    return generic;
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: { resetToken: this.hashToken(token), resetTokenExpiry: { gt: new Date() } },
    });
    if (!user) throw new BadRequestException('El enlace es inválido o ha expirado.');

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
        tokenVersion: { increment: 1 }, // cierra las sesiones abiertas
      },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private escapeHtml(v: string) {
    return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }

  private handleDBErrors(error: any): never {
    if (error instanceof HttpException) throw error;
    if (error.code === 'P2002') throw new BadRequestException('Correo ya registrado');
    throw new InternalServerErrorException("Error interno del servidor.");
  }
}