import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Delete, 
  Patch,
  ParseUUIDPipe
} from '@nestjs/common';
import { PeriodService } from './period.service';
import { CreatePeriodDto } from './create-period.dto';
import { AllowPendingPassword, Auth } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/enums/valid-roles.enum';

@Controller('period')
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  @Post()
  @Auth(ValidRoles.ADMIN)
  create(@Body() createPeriodDto: CreatePeriodDto) {
    return this.periodService.create(createPeriodDto);
  }

  @Get()
  @Auth()
  @AllowPendingPassword()
  findAll() {
    return this.periodService.findAll();
  }

  /** Período en curso: lo usan los formularios para mostrarlo (no se elige). */
  @Get('active')
  @Auth()
  @AllowPendingPassword()
  findActive() {
    return this.periodService.findActive();
  }

  @Patch(':id/activate')
  @Auth(ValidRoles.ADMIN)
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodService.activate(id);
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodService.findOne(id);
  }

  @Delete(':id')
  @Auth(ValidRoles.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.periodService.remove(id);
  }
}