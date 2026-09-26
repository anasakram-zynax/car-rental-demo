import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { PaymentGatewayConfigService } from '../application/services/payment-gateway-config.service';
import { UpdateStripeConfigDto, UpdateStripeEnabledDto } from './dto/stripe-config.dto';
import { UpdatePayPalConfigDto, UpdatePayPalEnabledDto } from './dto/paypal-config.dto';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AppConfigService } from '../../../shared/config/app-config.service';
import { DemoConfigOverrideUtil } from '../../../shared/demo/demo-config-override.util';

/**
 * Bank-transfer display details: allowlisted keys, trimmed, length-capped.
 * Anything else is dropped so junk can never reach the checkout page.
 */
function sanitizeManualDetails(value: unknown): Record<string, string> {
  const allowed: Record<string, number> = {
    accountTitle: 120,
    bankName: 120,
    accountNumber: 64,
    iban: 64,
    swiftCode: 32,
    instructions: 500,
  };
  const out: Record<string, string> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const max = allowed[k];
      if (!max || typeof v !== 'string') continue;
      const trimmed = v.trim().slice(0, max);
      if (trimmed) out[k] = trimmed;
    }
  }
  return out;
}

@UserTypes('admin')
@Controller('admin/settings/payment')
export class AdminPaymentSettingsController {
  constructor(
    private readonly service: PaymentGatewayConfigService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private get demoEmails(): string[] {
    const modeEmails = this.config.demo.demoModeEmails;
    if (modeEmails) return modeEmails.split(',').map((e) => e.trim()).filter(Boolean);
    const c = this.config.demo;
    return [c.adminEmail, c.agentEmail, c.userEmail];
  }

  private isDemoUser(user: any): boolean {
    // Same gate as AdminProviderSettingsController — demo override behavior
    // only when DEMO_MODE_ENABLED=true (email list alone is unsafe).
    if (!this.config.demo.enabled) return false;
    return !!user?.email && this.demoEmails.includes(user.email);
  }

  private async mergeGatewayOverrides(
    user: any,
    req: Request,
    res: Response,
    entityKey: string,
    config: Record<string, any>,
  ): Promise<Record<string, any>> {
    if (!this.isDemoUser(user)) return config;
    const util = new DemoConfigOverrideUtil(this.prisma);
    const sessionId = util.ensureSessionId(req, res);
    const overrides = await util.getOverrides(sessionId, 'gateway', entityKey);
    return util.mergeInto(config, overrides);
  }

  /**
   * Demo accounts must never touch payment gateway credentials — blocked
   * outright (see AdminProviderSettingsController.assertCanSaveCredentials).
   */
  private assertCanSaveCredentials(user: any): void {
    if (this.isDemoUser(user)) {
      throw new ForbiddenException(
        'Demo accounts cannot modify payment gateway credentials. Sign in with a non-demo admin account to save credentials.',
      );
    }
  }

  @Get('gateways')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Payment gateways listed.')
  getGateways() {
    return this.service.getGatewaysSummary();
  }

  @Get('gateways/stripe')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Stripe gateway config retrieved.')
  async getStripeGateway(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = await this.service.getGateway('stripe');
    const user = (req as any).user;
    return this.mergeGatewayOverrides(user, req, res, 'stripe', raw as any);
  }

  @Get('gateways/paypal')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('PayPal gateway config retrieved.')
  async getPayPalGateway(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = await this.service.getGateway('paypal');
    const user = (req as any).user;
    return this.mergeGatewayOverrides(user, req, res, 'paypal', raw as any);
  }

  @Put('gateways/stripe/enabled')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS)
  @ResponseMessage('Stripe enabled status updated.')
  setStripeEnabled(@Body() body: UpdateStripeEnabledDto) {
    return this.service.setGatewayEnabled('stripe', body.enabled);
  }

  @Put('gateways/paypal/enabled')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS)
  @ResponseMessage('PayPal enabled status updated.')
  setPayPalEnabled(@Body() body: UpdatePayPalEnabledDto) {
    return this.service.setGatewayEnabled('paypal', body.enabled);
  }

  /**
   * Enable/disable for manual (non-gateway) methods — bank_transfer,
   * pay_later. They carry no credentials, so one generic endpoint covers
   * both. Stripe/PayPal keep their dedicated routes above.
   */
  @Put('gateways/:gateway/enabled')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS)
  @ResponseMessage('Payment method enabled status updated.')
  setManualGatewayEnabled(
    @Param('gateway') gateway: string,
    @Body() body: UpdateStripeEnabledDto,
  ) {
    const key = gateway.toLowerCase();
    if (key !== 'bank_transfer' && key !== 'pay_later') {
      throw new ForbiddenException(
        `Use the gateway-specific endpoint for "${gateway}".`,
      );
    }
    return this.service.setGatewayEnabled(key, body.enabled);
  }

  /**
   * Save display details for manual methods — bank_transfer bank account
   * details shown at checkout. Stored as plain config (no secrets involved);
   * unknown keys are dropped, lengths capped.
   */
  @Put('gateways/:gateway/details')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS)
  @ResponseMessage('Payment method details updated.')
  async setManualGatewayDetails(
    @Param('gateway') gateway: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = gateway.toLowerCase();
    if (key !== 'bank_transfer' && key !== 'pay_later') {
      throw new ForbiddenException(
        `Use the gateway-specific endpoint for "${gateway}".`,
      );
    }
    const user = (req as any).user;
    this.assertCanSaveCredentials(user);
    return this.service.setGatewayCredentials(key, sanitizeManualDetails(body));
  }

  @Put('gateways/stripe/credentials')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS)
  @ResponseMessage('Stripe credentials updated.')
  async setStripeCredentials(
    @Body() body: UpdateStripeConfigDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = (req as any).user;
    this.assertCanSaveCredentials(user);
    return this.service.setGatewayCredentials('stripe', body as any);
  }

  @Put('gateways/paypal/credentials')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS)
  @ResponseMessage('PayPal credentials updated.')
  async setPayPalCredentials(
    @Body() body: UpdatePayPalConfigDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = (req as any).user;
    this.assertCanSaveCredentials(user);
    return this.service.setGatewayCredentials('paypal', body as any);
  }

  @Post('gateways/stripe/test-connection')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS)
  @ResponseMessage('Stripe connection tested.')
  testStripeConnection() {
    return this.service.testGatewayConnection('stripe');
  }

  @Post('gateways/paypal/test-connection')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_PAYMENTS)
  @ResponseMessage('PayPal connection tested.')
  testPayPalConnection() {
    return this.service.testGatewayConnection('paypal');
  }
}
