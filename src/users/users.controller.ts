import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { randomBytes } from 'crypto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PaginationDto } from 'src/Libs/common';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';
import { UserModel as User } from 'src/prisma/generated/models/User';
import { assertSelfOrAdmin } from 'src/common/access';

// Solo imágenes; la extensión sale del mimetype validado, nunca del nombre original.
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Solo ADMIN registra docentes. */
  @Post('create-teacher')
  @Auth(ValidRoles.ADMIN)
  createTeacher(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createTeacher(createUserDto);
  }

  /** Alta directa de usuario (rol USER): solo ADMIN. El registro público es /auth/register. */
  @Post()
  @Auth(ValidRoles.ADMIN)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  /** Listado completo de usuarios: solo ADMIN. */
  @Get()
  @Auth(ValidRoles.ADMIN)
  findAll(@Query() paginationDto?: PaginationDto) {
    return this.usersService.findAll(paginationDto);
  }

  /** Un usuario: el propio o ADMIN. */
  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    assertSelfOrAdmin(user, id);
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Auth()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() user: User,
  ) {
    assertSelfOrAdmin(user, id);
    return this.usersService.update(id, updateUserDto);
  }

  /** Imagen de perfil (propia o ADMIN). Máx. 5 MB, solo JPG/PNG/WEBP/GIF. */
  @Patch(':id/image')
  @Auth()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!IMAGE_TYPES[file.mimetype]) {
        return cb(new BadRequestException('Solo se permiten imágenes JPG, PNG, WEBP o GIF.'), false);
      }
      cb(null, true);
    },
    storage: diskStorage({
      destination: './uploads',
      filename: (_req, file, cb) => {
        cb(null, `user-${Date.now()}-${randomBytes(8).toString('hex')}${IMAGE_TYPES[file.mimetype]}`);
      },
    }),
  }))
  updateImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: User,
  ) {
    assertSelfOrAdmin(user, id);
    if (!file) throw new BadRequestException('Debes enviar una imagen en el campo "file".');
    return this.usersService.updateImage(id, file);
  }

  /** Cambia la contraseña: SOLO la propia (exige la contraseña actual). */
  @Patch(':id/change-password')
  @Auth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangePasswordDto,
    @GetUser() user: User,
  ) {
    if (user.id !== id) throw new ForbiddenException('Solo puedes cambiar tu propia contraseña.');
    return this.usersService.changePassword(id, body.oldPassword, body.newPassword);
  }

  @Delete(':id')
  @Auth(ValidRoles.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
