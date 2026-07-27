import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AppConfig } from '../../config/configuration';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { OtpService } from './otp/otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConsoleOtpDelivery } from './otp/console-otp-delivery';
import { OTP_DELIVERY, OtpDeliveryProvider } from './otp/otp-delivery.interface';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    OtpService,
    JwtStrategy,
    ConsoleOtpDelivery,
    {
      provide: OTP_DELIVERY,
      inject: [ConfigService, ConsoleOtpDelivery],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        consoleDelivery: ConsoleOtpDelivery,
      ): OtpDeliveryProvider => {
        const provider = config.get('OTP_DELIVERY_PROVIDER', { infer: true });
        // MVP: only the console mock exists. Real SMS providers (unifonic/twilio)
        // plug in here when chosen; until then we always use the console mock.
        switch (provider) {
          case 'console':
          default:
            return consoleDelivery;
        }
      },
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
