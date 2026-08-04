import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { SellerDashboardService } from './seller-dashboard.service';
import { SellerController } from './seller.controller';

@Module({
  imports: [WalletModule],
  controllers: [SellerController],
  providers: [SellerDashboardService],
})
export class SellerModule {}
