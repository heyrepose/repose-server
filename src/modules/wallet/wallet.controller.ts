import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WithdrawDto } from './dto/wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  getWallet(@CurrentUser('id') userId: string) {
    return this.wallet.getWallet(userId);
  }

  @Post('onboard')
  onboard(@CurrentUser('id') userId: string) {
    return this.wallet.startOnboarding(userId);
  }

  @Post('withdraw')
  withdraw(@CurrentUser('id') userId: string, @Body() dto: WithdrawDto) {
    return this.wallet.withdraw(userId, dto.amountAed);
  }
}
