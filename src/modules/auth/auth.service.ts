import { Injectable } from '@nestjs/common';
import { OtpPurpose, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountSuspendedException,
  EmailTakenException,
  InvalidCredentialsException,
  PhoneTakenException,
} from './auth.errors';
import { OtpService } from './otp/otp.service';
import { TokensService, TokenPair } from './tokens.service';
import type { JwtPayload } from './strategies/jwt.strategy';
import { generateUsername } from './username.util';

export interface AuthResult extends TokenPair {
  user: Pick<User, 'id' | 'fullName' | 'phone' | 'email' | 'username'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
  ) {}

  private toPayload(user: User): JwtPayload {
    return { sub: user.id, role: user.role, email: user.email, phone: user.phone };
  }

  async signup(input: {
    phone?: string;
    email?: string;
    fullName: string;
    password?: string;
  }): Promise<{ userId: string; phoneVerificationRequired: boolean }> {
    if (input.phone) {
      const exists = await this.prisma.user.findUnique({ where: { phone: input.phone } });
      if (exists) throw new PhoneTakenException();
    }
    if (input.email) {
      const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (exists) throw new EmailTakenException();
    }

    const passwordHash = input.password
      ? await bcrypt.hash(input.password, 12)
      : null;
    const username = await this.allocateUsername(input.fullName);

    const user = await this.prisma.user.create({
      data: {
        phone: input.phone,
        email: input.email,
        fullName: input.fullName,
        username,
        passwordHash,
      },
    });

    if (input.phone) {
      await this.otp.request(input.phone, OtpPurpose.SIGNUP);
    }

    return {
      userId: user.id,
      phoneVerificationRequired: Boolean(input.phone),
    };
  }

  async requestOtp(phone: string, purpose: OtpPurpose): Promise<number> {
    return this.otp.request(phone, purpose);
  }

  async verifyOtp(
    phone: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<AuthResult> {
    await this.otp.verify(phone, code, purpose);

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user && purpose === OtpPurpose.LOGIN) {
      throw new InvalidCredentialsException();
    }
    if (!user) {
      // Defensive: signup should have created the user; create a minimal one if not.
      user = await this.prisma.user.create({
        data: {
          phone,
          fullName: 'Repose User',
          username: await this.allocateUsername('user'),
          isPhoneVerified: true,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isPhoneVerified: true, lastActiveAt: new Date() },
      });
    }

    this.assertActive(user);
    const pair = await this.tokens.issueTokenPair(this.toPayload(user));
    return { ...pair, user: this.publicUser(user) };
  }

  async login(identifier: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });
    if (!user || !user.passwordHash) throw new InvalidCredentialsException();

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new InvalidCredentialsException();

    this.assertActive(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    const pair = await this.tokens.issueTokenPair(this.toPayload(user));
    return { ...pair, user: this.publicUser(user) };
  }

  async refresh(presented: string): Promise<TokenPair> {
    return this.tokens.rotate(presented, async (userId) => {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new InvalidCredentialsException();
      this.assertActive(user);
      return this.toPayload(user);
    });
  }

  async logout(presented: string): Promise<void> {
    await this.tokens.revoke(presented);
  }

  private assertActive(user: User): void {
    if (user.status !== 'ACTIVE') throw new AccountSuspendedException();
  }

  private publicUser(user: User) {
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      username: user.username,
    };
  }

  private async allocateUsername(seed: string): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = generateUsername(seed);
      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
      });
      if (!taken) return candidate;
    }
    return generateUsername(seed, true);
  }
}
