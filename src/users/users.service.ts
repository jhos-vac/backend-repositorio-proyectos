import { 
  Injectable, 
  NotFoundException, 
  InternalServerErrorException, 
  ConflictException, 
  BadRequestException 
} from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { BaseService } from 'src/prisma/base.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { PaginationDto } from 'src/Libs/common';
import { Prisma } from 'src/prisma/generated/client'; 
import { USER_OMIT } from 'src/common/sanitize';
import * as deepEmailValidator from 'deep-email-validator';

@Injectable()
export class UsersService extends BaseService<any, CreateUserDto, UpdateUserDto> {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly authService: AuthService,
  ) {
    super(prismaService, { name: 'user' });
  }

  private issueTokens(user: { id: string; tokenVersion: number }) {
    return this.authService.issueTokens(user);
  }

  private isDomainAllowed(email: string): boolean {
    if (!email.includes('@')) return false;
    const domain = email.split('@')[1].toLowerCase();
    
    const allowedDomains = [
      'sudamericano.edu.ec',
      'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 
      'yahoo.es', 'icloud.com', 'live.com', 'msn.com', 'me.com', 'zoho.com'
    ];

    const allowedExtensions = [
      '.edu.ec', '.gob.ec', '.org.ec', 
      '.ec',                          
      '.edu', '.gob', '.gov',          
    ];

    return allowedDomains.includes(domain) || allowedExtensions.some(ext => domain.endsWith(ext));
  }

  private async validateEmailDeep(email: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    const res = await deepEmailValidator.validate({
      email: email,
      validateRegex: true,
      validateTypo: false,       
      validateDisposable: true,
      validateMx: isProduction,  
      validateSMTP: false,       
    });

    if (!res.valid) {
      const reason = res.reason || 'formato inválido';
      throw new BadRequestException(`El correo electrónico no es válido. Razón: ${reason}`);
    }
  }

  
  async create(createUserDto: CreateUserDto) {
    const { password, email, roleId: _, ...rest } = createUserDto;

    if (!this.isDomainAllowed(email)) {
      throw new BadRequestException('Dominio de correo no permitido.');
    }

    await this.validateEmailDeep(email);

    const role = await this.prismaService.role.findFirst({ where: { name: 'USER' } });
    if (!role) throw new InternalServerErrorException('Error: El rol USER no existe.');

    const hashedPassword = await bcrypt.hash(password, 12);

    try {
      const user = await this.prismaService.user.create({
        data: {
          ...rest,
          email: email.toLowerCase(),
          password: hashedPassword,
          roleId: role.id,
        },
        include: { role: true, career: true },
        omit: USER_OMIT
      });
      

      return user;

    } catch (error) {
      this.handleDBErrors(error);
    }
  }

  
  async createTeacher(createUserDto: CreateUserDto) {
    const { password, email, name, careerId } = createUserDto as any; 

    if (!this.isDomainAllowed(email)) throw new BadRequestException('Dominio de correo no permitido.');
    await this.validateEmailDeep(email);

    if (!careerId) throw new BadRequestException('El ID de la carrera es obligatorio.');

    const role = await this.prismaService.role.findFirst({ where: { name: 'TEACHER' } });
    if (!role) throw new InternalServerErrorException('Error: El rol TEACHER no existe.');

    const hashedPassword = await bcrypt.hash(password, 12);

    try {
      const user = await this.prismaService.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          roleId: role.id,
          careerId: careerId,
          needsPasswordChange: true, // <--- AÑADIDO: Fuerza al docente a cambiar la clave
        },
        include: { role: true, career: true },
        omit: USER_OMIT
      });
      
      return user;

    } catch (error) {
      this.handleDBErrors(error);
    }
  }


  async findAll(paginationDto?: PaginationDto) {
    const { limit = 10, page = 1, order = 'desc' } = paginationDto || {};
    const skip = (page - 1) * limit;
    
    const total = await this.prismaService.user.count();
    const data = await this.prismaService.user.findMany({
      skip, 
      take: limit, 
      include: { role: true, career: true },
        omit: USER_OMIT, 
      orderBy: { createdAt: order }
    });

    const totalPages = Math.ceil(total / limit);
    return { 
      data, 
      meta: { 
        total, 
        pagination: { page, limit, order: order as "asc" | "desc" }, 
        totalPages, 
        hasNextPage: page < totalPages, 
        hasPreviousPage: page > 1 
      } 
    };
  }

  async findOne(id: string) {
    const user = await this.prismaService.user.findUnique({ 
      where: { id }, 
      include: { role: true, career: true },
        omit: USER_OMIT 
    });
    if (!user) throw new NotFoundException(`Usuario no encontrado`);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`Usuario no encontrado`);

    // password (solo por change-password), roleId (nadie se auto-asigna rol) e
    // image (solo por PATCH :id/image) NO se aceptan aquí.
    const { password: _p, roleId: _r, image: _i, email, ...rest } = updateUserDto;

    const dataToUpdate: any = { ...rest };
    if (email) dataToUpdate.email = email.toLowerCase();

    try {
      return await this.prismaService.user.update({ 
        where: { id }, 
        data: dataToUpdate, 
        include: { role: true, career: true },
        omit: USER_OMIT 
      });
    } catch (error) { this.handleDBErrors(error); }
  }

  async updateImage(id: string, file: Express.Multer.File) {
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`Usuario no encontrado`);

    return this.prismaService.user.update({ 
      where: { id }, 
      data: { image: `/uploads/${file.filename}` },
      include: { role: true, career: true },
        omit: USER_OMIT 
    });
  }

  // === NUEVO MÉTODO PARA CAMBIAR CONTRASEÑA ===
  async changePassword(id: string, oldPassword: string, newPassword: string) {
    const user = await this.prismaService.user.findUnique({ 
      where: { id } 
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Comparamos la contraseña enviada con la guardada en BD
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    
    if (!isPasswordValid) {
      throw new BadRequestException(['La contraseña antigua es incorrecta.']); 
    }

    // Encriptamos la nueva contraseña
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    try {
      await this.prismaService.user.update({
        where: { id },
        data: {
          password: hashedNewPassword,
          needsPasswordChange: false,
          tokenVersion: { increment: 1 }, // cierra el resto de sesiones
        },
      });

      // Se devuelven tokens nuevos para que ESTA sesión siga activa.
      const fresh = await this.prismaService.user.findUniqueOrThrow({ where: { id }, select: { id: true, tokenVersion: true } });
      return { message: 'Contraseña actualizada con éxito', ...(await this.issueTokens(fresh)) };
    } catch (error) {
      this.handleDBErrors(error);
    }
  }
  // === FIN NUEVO MÉTODO ===

  async remove(id: string) {
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`Usuario no encontrado`);
    
    try { 
      return await this.prismaService.user.delete({ where: { id }, omit: USER_OMIT }); 
    } catch (error) { this.handleDBErrors(error); }
  }

  private handleDBErrors(error: any): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException('El correo electrónico ya se encuentra registrado');
      if (error.code === 'P2003') throw new BadRequestException('La carrera seleccionada no existe o datos relacionados inválidos.');
    }
    if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
    
    console.error("Error Database:", error);
    throw new InternalServerErrorException('Error inesperado en el servidor.');
  }
}