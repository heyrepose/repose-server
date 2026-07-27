import { OtpPurpose } from '@prisma/client';

export const OTP_DELIVERY = Symbol('OTP_DELIVERY');

/**
 * Delivery transport for OTP codes. Generation/hashing/verification always live
 * in NestJS; only the send channel is swappable. MVP uses the console mock.
 */
export interface OtpDeliveryProvider {
  sendOtp(phone: string, code: string, purpose: OtpPurpose): Promise<void>;
}
