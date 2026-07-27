import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import type { AppConfig } from '../../../config/configuration';
import {
  OtpExpiredException,
  OtpInvalidException,
  OtpRateLimitedException,
  OtpTooManyAttemptsException,
} from '../auth.errors';
import { OTP_DELIVERY, OtpDeliveryProvider } from './otp-delivery.interface';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(OTP_DELIVERY) private readonly delivery: OtpDeliveryProvider,
  ) {}

  /** Generates, stores (hashed), and delivers an OTP. Rate-limited 1/60s per phone. */
  async request(phone: string, purpose: OtpPurpose): Promise<number> {
    const rlKey = `otp:req:${phone}`;
    const existing = await this.redis.get(rlKey);
    if (existing) throw new OtpRateLimitedException();
    await this.redis.set(rlKey, '1', 60);

    const ttl = this.config.get('OTP_TTL_SECONDS', { infer: true });
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);

    await this.prisma.otpVerification.create({
      data: {
        phone,
        purpose,
        codeHash,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });

    await this.delivery.sendOtp(phone, code, purpose);
    return ttl;
  }

  /** Verifies the latest unconsumed OTP for a phone+purpose. Throws on any failure. */
  async verify(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    const otp = await this.prisma.otpVerification.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new OtpInvalidException();

    if (otp.expiresAt.getTime() < Date.now()) throw new OtpExpiredException();

    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
    if (otp.attempts >= maxAttempts) throw new OtpTooManyAttemptsException();

    const matches = await bcrypt.compare(code, otp.codeHash);
    if (!matches) {
      await this.prisma.otpVerification.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new OtpInvalidException();
    }

    await this.prisma.otpVerification.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
  }
}
