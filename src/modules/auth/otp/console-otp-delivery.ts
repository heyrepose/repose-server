import { Injectable, Logger } from '@nestjs/common';
import { OtpPurpose } from '@prisma/client';
import { OtpDeliveryProvider } from './otp-delivery.interface';

/**
 * MVP OTP delivery: logs the code to the API terminal instead of sending an SMS.
 * No SMS vendor account required. Never used once a real provider is wired.
 */
@Injectable()
export class ConsoleOtpDelivery implements OtpDeliveryProvider {
  private readonly logger = new Logger('OTP');

  async sendOtp(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    this.logger.log(`[OTP] phone=${phone} purpose=${purpose} code=${code}`);
  }
}
