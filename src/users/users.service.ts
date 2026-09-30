import { isStudent } from 'src/common/access';
import { 
  Injectable, 
  NotFoundException, 
  InternalServerErrorException, 
  ConflictException,
  ForbiddenException,
  BadRequestException 
} from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { BaseService } from 'src/prisma/base.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { PaginationDto } from 'src/Libs/common';
import { UserQueryDto } from './dto/user-query.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { isAdmin } from 'src/common/access';
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
    const { password, email, roleId, ...rest } = createUserDto;

    if (!this.isDomainAllowed(email)) {
      throw new BadRequestException('Dominio de correo no permitido.');
    }

    await this.validateEmailDeep(email);

    // El ADMIN puede elegir cualquier rol; por defecto USER (estudiante)
    const role = roleId
      ? await this.prismaService.role.findUnique({ where: { id: roleId } })
      : await this.prismaService.role.findFirst({ where: { name: 'USER' } });
    if (!role) throw new BadRequestException('El rol indicado no existe.');
    if (role.name === 'USER' && !rest.level) throw new BadRequestException('El nivel (1 a 4) es obligatorio para estudiantes.');

    const hashedPassword = await bcrypt.hash(password, 12);

    try {
      const user = await this.prismaService.user.create({
        data: {
          ...rest,
          email: email.toLowerCase(),
          password: hashedPassword,
          roleId: role.id,
          needsPasswordChange: true, // alta hecha por el admin: la clave inicial es temporal
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


  private userWhere(q: UserQueryDto) {
    const w: any = {};
    if (q.role) w.role = { name: q.role };
    if (q.careerId) w.careerId = q.careerId;
    if (q.level) w.level = q.level;
    if (q.search) {
      w.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    return w;
  }

  private async pageUsers(where: any, q: PaginationDto) {
    const { limit = 10, page = 1, order = 'desc' } = q || ({} as PaginationDto);
    const [total, data] = await Promise.all([
      this.prismaService.user.count({ where }),
      this.prismaService.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { role: true, career: true, _count: { select: { createdProjects: true } } },
        omit: USER_OMIT,
        orderBy: { createdAt: order },
      }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: { total, pagination: { page, limit, order: order as 'asc' | 'desc' }, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
    };
  }

  async findAll(q?: UserQueryDto) {
    return this.pageUsers(this.userWhere(q || ({} as UserQueryDto)), q as PaginationDto);
  }

  async candidates(careerId: string | undefined, user: any) {
    const career = isStudent(user) ? user.careerId : careerId;
    if (!career) throw new BadRequestException('Indica la carrera (careerId).');
    return this.prismaService.user.findMany({
      where: { careerId: career, role: { name: 'USER' } },
      select: { id: true, name: true, level: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  /** Estudiantes de las carrera+nivel del docente (ADMIN: todos). */
  async findStudents(q: UserQueryDto, user: any) {
    const where: any = { ...this.userWhere(q), role: { name: 'USER' } };
    if (!isAdmin(user)) {
      const cohorts = await this.prismaService.teacherAssignment.findMany({
        where: { teacherId: user.id }, select: { careerId: true, level: true },
      });
      where.AND = [{ OR: cohorts.length ? cohorts.map((c) => ({ careerId: c.careerId, level: c.level })) : [{ id: { in: [] } }] }];
    }
    return this.pageUsers(where, q);
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
    const { password: _p, roleId: _r, image: _i, careerId: _c, level: _l, email, ...rest } = updateUserDto as any;

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

  private async countAdmins() {
    return this.prismaService.user.count({ where: { role: { name: 'ADMIN' } } });
  }

  /** Edición completa por el ADMIN: datos, rol, carrera, nivel y reinicio de clave. */
  async adminUpdate(id: string, dto: AdminUpdateUserDto, actor: { id: string }) {
    const user = await this.prismaService.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const { password, email, roleId, ...rest } = dto;
    const data: any = { ...rest };
    if (email) data.email = email.toLowerCase();

    let newRoleName = user.role.name;
    if (roleId && roleId !== user.roleId) {
      const role = await this.prismaService.role.findUnique({ where: { id: roleId } });
      if (!role) throw new BadRequestException('El rol indicado no existe.');
      if (user.role.name === 'ADMIN' && (id === actor.id || (await this.countAdmins()) <= 1)) {
        throw new ConflictException('No puedes quitar el rol ADMIN al único administrador ni a tu propia cuenta.');
      }
      data.roleId = roleId;
      newRoleName = role.name;
    }
    if (newRoleName === 'USER') {
      const finalLevel = dto.level === undefined ? user.level : dto.level;
      if (!finalLevel) throw new BadRequestException('Un estudiante necesita nivel (1 a 4).');
    }
    if (newRoleName === 'TEACHER' || newRoleName === 'ADMIN') {
      // si deja de ser docente pierde sus asignaciones
    }
    if (password) {
      data.password = await bcrypt.hash(password, 12);
      data.needsPasswordChange = dto.needsPasswordChange ?? true;
      data.tokenVersion = { increment: 1 };
    }

    try {
      return await this.prismaService.$transaction(async (tx) => {
        if (data.roleId && user.role.name === 'TEACHER' && newRoleName !== 'TEACHER') {
          await tx.teacherAssignment.deleteMany({ where: { teacherId: id } });
        }
        return tx.user.update({ where: { id }, data, include: { role: true, career: true }, omit: USER_OMIT });
      });
    } catch (error) { this.handleDBErrors(error); }
  }

  async remove(id: string, actor?: { id: string }) {
    const user = await this.prismaService.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw new NotFoundException(`Usuario no encontrado`);
    if (actor && actor.id === id) throw new ConflictException('No puedes eliminar tu propia cuenta.');
    if (user.role.name === 'ADMIN' && (await this.countAdmins()) <= 1) {
      throw new ConflictException('No se puede eliminar al único administrador.');
    }

    try {
      // Los proyectos NO se borran: conservan su registro sin autor; se limpian solo los vínculos.
      return await this.prismaService.$transaction(async (tx) => {
        await tx.userProject.deleteMany({ where: { userId: id } });
        await tx.project.updateMany({ where: { createdBy: id }, data: { createdBy: null } });
        await tx.project.updateMany({ where: { reviewedById: id }, data: { reviewedById: null } });
        await tx.skills.updateMany({ where: { createdById: id }, data: { createdById: null } });
        return tx.user.delete({ where: { id }, omit: USER_OMIT });
      });
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