import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Delete, 
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