import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AppConfig } from '../../config/configuration';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RefreshInvalidException } from './auth.errors';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { OtpRequestDto, OtpVerifyDto } from './dto/otp.dto';
import { SignupDto } from './dto/signup.dto';

const REFRESH_COOKIE = 'repose_rt';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Refresh-token transport (locked decision):
   * - Web: set an httpOnly, Secure, SameSite=Lax cookie and OMIT the token from
   *   the JSON body (XSS can't read it).
   * - Mobile/other clients: also return it in the body for secure storage.
   * A client is treated as "web" when it sends the request with credentials and
   * an Origin header; we always set the cookie and additionally include the token
   * in the body only for non-browser clients (no Origin header).
   */
  private applyRefresh(
    req: Request,
    res: Response,
    refreshToken: string,
  ): { refreshToken?: string } {
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: ttl * 1000,
      path: '/api/v1/auth',
    });
    const isBrowser = Boolean(req.headers.origin);
    return isBrowser ? {} : { refreshToken };
  }

  private readRefresh(req: Request, bodyToken?: string): string {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
    const token = cookieToken ?? bodyToken;
    if (!token) throw new RefreshInvalidException();
    return token;
  }

  @Public()
  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body() dto: OtpRequestDto) {
    const expiresInSeconds = await this.auth.requestOtp(dto.phone, dto.purpose);
    return { expiresInSeconds };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyOtp(dto.phone, dto.code, dto.purpose);
    const extra = this.applyRefresh(req, res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user, ...extra };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.identifier, dto.password);
    const extra = this.applyRefresh(req, res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user, ...extra };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = this.readRefresh(req, dto.refreshToken);
    const pair = await this.auth.refresh(presented);
    const extra = this.applyRefresh(req, res, pair.refreshToken);
    return { accessToken: pair.accessToken, ...extra };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = this.readRefresh(req, dto?.refreshToken);
    await this.auth.logout(presented);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }
}
