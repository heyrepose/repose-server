import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { DevConfirmPaymentDto } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('payments/config')
  getConfig() {
    return this.payments.getConfig();
  }

  @ApiBearerAuth()
  @Post('payments/dev/confirm')
  @HttpCode(200)
  confirmDev(
    @CurrentUser('id') userId: string,
    @Body() dto: DevConfirmPaymentDto,
  ) {
    return this.payments.confirmDev(userId, dto.orderId, dto.outcome);
  }

  @Public()
  @Post('webhooks/stripe')
  @HttpCode(200)
  handleStripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody =
      req.rawBody ??
      (Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(JSON.stringify(req.body ?? {}), 'utf8'));
    return this.payments.handleWebhook(rawBody, signature);
  }
}
