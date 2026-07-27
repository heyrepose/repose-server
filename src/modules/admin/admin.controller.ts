import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  AdminReportsQueryDto,
  ModerateListingDto,
  UpdateCategoryAdminDto,
  UpdateUserStatusDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('reports')
  listReports(@Query() query: AdminReportsQueryDto) {
    return this.admin.listReports(query);
  }

  @Patch('listings/:id/moderate')
  moderateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateListingDto,
  ) {
    return this.admin.moderateListing(id, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryAdminDto,
  ) {
    return this.admin.updateCategory(id, dto);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @CurrentUser('id') actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.admin.updateUserStatus(id, dto, actorId);
  }

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }
}
