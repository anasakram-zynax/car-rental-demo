import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { AgentRegisterDto } from './dto/agent-register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RateLimitGuard } from '../../shared/rate-limit/rate-limit.guard';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { AppConfigService } from '../../shared/config/app-config.service';
import type { Request, Response } from 'express';

import { RateLimitTier } from '../../shared/rate-limit/rate-limit-tier.decorator';

function parseExpiryMs(expiry: string, fallbackMs: number): number {
  const match = expiry.match(/^(\\d+)([smhd])$/);
  if (!match) return fallbackMs;

  const value = Number(match[1]);
  switch (match[2]) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return fallbackMs;
  }
}

@Controller('auth')
@RateLimitTier({ tier: 'anonymous' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
    };
    res.cookie('access_token', accessToken, {
      ...cookieOpts,
      maxAge: parseExpiryMs(this.config.auth.jwtAccessExpiry, 30 * 60 * 1000),
    });
    res.cookie('refresh_token', refreshToken, {
      ...cookieOpts,
      maxAge: parseExpiryMs(this.config.auth.jwtRefreshExpiry, 7 * 24 * 60 * 60 * 1000),
    });
  }

  private clearAuthCookies(res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    const opts = {
      path: '/',
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
      secure: isProd,
    };
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RateLimitGuard)
  @ResponseMessage('User registered successfully.')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.config.demo.allowPublicSignup) {
      throw new UnauthorizedException('Public signup is currently disabled. Use the Get Demo Access form instead.');
    }
    const result = await this.authService.register(dto);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Post('agent/register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Agent registration submitted. Awaiting admin approval.')
  async registerAgent(
    @Body() dto: AgentRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.config.demo.allowPublicSignup) {
      throw new UnauthorizedException('Public signup is currently disabled. Use the Get Demo Access form instead.');
    }
    const result = await this.authService.registerAgent(dto);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Login successful.')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  // ── Google OAuth ──────────────────────────────

  @Get('google')
  googleAuth(@Query('mode') mode: string, @Query('role') role: string, @Res() res: Response) {
    const state = JSON.stringify({
      mode: mode === 'signup' ? 'signup' : 'signin',
      role: role === 'agent' ? 'agent' : 'customer',
    });
    const callbackUrl =
      process.env.GOOGLE_CALLBACK_URL ??
      `http://localhost:${process.env.PORT ?? 4000}/api/v1/auth/google/callback`;

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'email profile',
      state,
    });

    res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    );
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request & { user: any },
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    let mode: 'signin' | 'signup' = 'signin';
    let role: 'customer' | 'agent' = 'customer';

    try {
      const parsed = JSON.parse(req.query.state as string) as { mode?: string; role?: string };
      mode = parsed.mode === 'signup' ? 'signup' : 'signin';
      role = parsed.role === 'agent' ? 'agent' : 'customer';
    } catch {
      mode = (req.query.state as string) === 'signup' ? 'signup' : 'signin';
    }

    const redirectPage = mode === 'signup' ? 'signup' : 'signin';

    try {
      const result = await this.authService.handleGoogleLogin(req.user, mode, role);
      this.setAuthCookies(res, result.accessToken, result.refreshToken);

      if (role === 'agent') {
        res.redirect(`${frontendUrl}/agent`);
      } else {
        res.redirect(`${frontendUrl}/`);
      }
    } catch (err: any) {
      const message = err?.message ?? 'Google authentication failed';
      res.redirect(
        `${frontendUrl}/${redirectPage}?error=google&message=${encodeURIComponent(message)}`,
      );
    }
  }

  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Token refreshed.')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refreshToken ?? req.cookies?.refresh_token;
    if (!token) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException('Refresh token not provided');
    }
    const result = await this.authService.refresh(token);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Logged out successfully.')
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refreshToken ?? req.cookies?.refresh_token;
    if (token) {
      await this.authService.logout(token);
    }
    this.clearAuthCookies(res);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('All sessions terminated.')
  async logoutAll(
    @CurrentUser() user: { id: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.id);
    this.clearAuthCookies(res);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Current user profile retrieved.')
  me(@CurrentUser() user: { id: string }) {
    return this.authService.getProfile(user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Profile updated successfully.')
  updateProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Password changed successfully.')
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @ResponseMessage(
    'If an account with that email exists, a password reset link has been sent.',
  )
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Password reset successfully.')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('reset-password/:token/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Token verified.')
  async verifyResetToken(@Param('token') token: string) {
    if (!token) throw new UnauthorizedException('Reset token not provided');
    const valid = await this.authService.verifyResetToken(token);
    return { valid };
  }
}
