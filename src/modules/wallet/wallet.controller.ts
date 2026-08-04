import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
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

  /** Dev / mock mode only — marks Connect onboarding complete without Stripe. */
  @Post('dev/complete-onboarding')
  @HttpCode(200)
  completeOnboardingDev(@CurrentUser('id') userId: string) {
    return this.wallet.completeOnboardingDev(userId);
  }

  @Post('withdraw')
  withdraw(@CurrentUser('id') userId: string, @Body() dto: WithdrawDto) {
    return this.wallet.withdraw(userId, dto.amountAed);
  }
}
