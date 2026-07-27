import { Module, forwardRef } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrderStateMachine } from './order-state-machine.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AddressesModule,
    NotificationsModule,
    forwardRef(() => ChatModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => WalletModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStateMachine],
  exports: [OrdersService, OrderStateMachine],
})
export class OrdersModule {}
