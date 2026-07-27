import { Module, forwardRef } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripePaymentProvider } from './stripe-payment.provider';

@Module({
  imports: [
    CartModule,
    NotificationsModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => WalletModule),
  ],
  controllers: [PaymentsController],
  providers: [
    StripePaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: StripePaymentProvider },
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
