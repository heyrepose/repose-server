import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SellerDashboardService } from './seller-dashboard.service';

@ApiTags('seller')
@ApiBearerAuth()
@Controller('seller')
export class SellerController {
  constructor(private readonly dashboard: SellerDashboardService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser('id') userId: string) {
    return this.dashboard.getDashboard(userId);
  }
}
