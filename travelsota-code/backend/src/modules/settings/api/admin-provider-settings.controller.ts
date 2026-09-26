import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Put,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsNotEmpty, IsString } from 'class-validator';
import { type Request, type Response } from 'express';
import { ProviderConfigService } from '../application/services/provider-config.service';
import {
  UpdateTravelportConfigDto,
  UpdateTravelportEnabledDto,
} from './dto/travelport-config.dto';
import {
  UpdateDuffelConfigDto,
  UpdateDuffelEnabledDto,
} from './dto/duffel-config.dto';
import {
  UpdateHotelbedsConfigDto,
  UpdateHotelbedsEnabledDto,
} from './dto/hotelbeds-config.dto';
import {
  UpdateRatehawkConfigDto,
  UpdateRatehawkEnabledDto,
} from './dto/ratehawk-config.dto';
import {
  UpdateAmadeusConfigDto,
  UpdateAmadeusEnabledDto,
} from './dto/amadeus-config.dto';
import {
  UpdateAmadeusHotelsConfigDto,
  UpdateAmadeusHotelsEnabledDto,
} from './dto/amadeus-hotels-config.dto';
import { UpdateManualEnabledDto } from './dto/manual-config.dto';
import {
  UpdateTravelportStaysConfigDto,
  UpdateTravelportStaysEnabledDto,
} from './dto/travelport-stays-config.dto';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AppConfigService } from '../../../shared/config/app-config.service';
import { DemoConfigOverrideUtil } from '../../../shared/demo/demo-config-override.util';
import { type ModuleKey } from '../application/services/provider-config.service';
import { HotelsProviderRegistryService } from '../../hotels/providers/registry/hotels-provider-registry.service';

class SetModuleNameDto {
  @IsNotEmpty() @IsString() name!: string;
}

class SetModuleOrderDto {
  @IsString({ each: true }) order!: string[];
}

class ToggleModuleDto {
  @IsBoolean() enabled!: boolean;
}


@UserTypes('admin')
@Controller('admin/settings/modules')
export class AdminProviderSettingsController {
  constructor(
    private readonly service: ProviderConfigService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly hotelsRegistry: HotelsProviderRegistryService,
  ) {}

  /**
   * WS3.4: the provider registry caches discovery for 5 minutes; invalidate
   * it whenever admin writes provider settings so changes apply immediately.
   */
  private invalidateProviderCaches(): void {
    this.hotelsRegistry.invalidateCaches();
  }

  private get demoEmails(): string[] {
    const modeEmails = this.config.demo.demoModeEmails;
    if (modeEmails) return modeEmails.split(',').map((e) => e.trim()).filter(Boolean);
    const c = this.config.demo;
    return [c.adminEmail, c.agentEmail, c.userEmail];
  }

  private isDemoUser(user: any): boolean {
    // Demo override behavior must be opt-in: DEMO_MODE_ENABLED=true. The
    // email list alone is not a safe discriminator — a deployment whose
    // DEMO_ADMIN_EMAIL matches a real staff login would silently redirect
    // that admin's credential saves into 4-hour session overrides while the
    // UI still showed "Configured" (Test Connection/Search read the DB row
    // and failed with missing credentials).
    if (!this.config.demo.enabled) return false;
    return !!user?.email && this.demoEmails.includes(user.email);
  }

  private async mergeProviderOverrides(
    user: any,
    req: Request,
    res: Response,
    entityKey: string,
    config: Record<string, any>,
  ): Promise<Record<string, any>> {
    if (!this.isDemoUser(user)) return config;
    const util = new DemoConfigOverrideUtil(this.prisma);
    const sessionId = util.ensureSessionId(req, res);
    const overrides = await util.getOverrides(sessionId, 'provider', entityKey);
    return util.mergeInto(config, overrides);
  }

  /**
   * Demo accounts must never touch provider credentials. Rather than
   * redirecting their saves into 4-hour session overrides (which made the
   * tab look "Configured" while Test Connection / Search read the DB row and
   * failed), demo users are now blocked outright. Non-demo admins always
   * write the real database row.
   */
  private assertCanSaveCredentials(user: any): void {
    if (this.isDemoUser(user)) {
      throw new ForbiddenException(
        'Demo accounts cannot modify supplier credentials. Sign in with a non-demo admin account to save credentials.',
      );
    }
  }

  @Get()
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Modules settings retrieved.')
  getModules() {
    return this.service.getModulesSummary();
  }

  // ── Module-level config (name + master switch) ──

  @Get('config')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Module config retrieved.')
  getModuleConfig() {
    return this.service.getModuleConfig();
  }

  @Put('config/order')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_MODULES)
  @ResponseMessage('Module display order updated.')
  setModuleOrder(@Body() dto: SetModuleOrderDto) {
    return this.service.setModuleOrder(dto.order as ModuleKey[]);
  }

  @Put('config/:module')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_MODULES)
  @ResponseMessage('Module name updated.')
  setModuleName(@Param('module') module: ModuleKey, @Body() dto: SetModuleNameDto) {
    return this.service.setModuleConfigName(module, dto.name);
  }

  @Post(':module/toggle')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_MODULES)
  @ResponseMessage('Module suppliers toggled.')
  toggleModule(@Param('module') module: ModuleKey, @Body() dto: ToggleModuleDto) {
    return this.service.toggleModuleAll(module, dto.enabled);
  }

  @Post('flights/providers/:provider/test-connection')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_MODULES)
  @ResponseMessage('Flights provider connection tested.')
  testFlightsProviderConnection(
    @Param('provider') provider: 'travelport' | 'duffel' | 'amadeus',
  ) {
    return this.service.testFlightsProviderConnection(provider);
  }

  @Get('flights/providers/:provider')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Flights provider config retrieved.')
  async getFlightsProvider(
    @Param('provider') provider: 'travelport' | 'duffel' | 'amadeus',
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = await this.service.getFlightsProvider(provider);
    const user = (req as any).user;
    const merged = await this.mergeProviderOverrides(user, req, res, provider, raw as any);
    return merged;
  }

  @Put('flights/providers/:provider/enabled')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_MODULES)
  @ResponseMessage('Flights provider enabled status updated.')
  setFlightsProviderEnabled(
    @Param('provider') provider: 'travelport' | 'duffel' | 'amadeus' | 'manual',
    @Body() body: UpdateTravelportEnabledDto | UpdateDuffelEnabledDto | UpdateAmadeusEnabledDto | UpdateManualEnabledDto,
  ) {
    return this.service.setFlightsProviderEnabled(provider, body.enabled);
  }

  @Put('flights/providers/:provider/credentials')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_MODULES)
  @ResponseMessage('Flights provider credentials updated.')
  async setFlightsProviderCredentials(
    @Param('provider') provider: 'travelport' | 'duffel' | 'amadeus',
    @Body() body: UpdateTravelportConfigDto | UpdateDuffelConfigDto | UpdateAmadeusConfigDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = (req as any).user;
    this.assertCanSaveCredentials(user);
    return this.service.setFlightsProviderCredentials(provider, body as any);
  }

  @Post('hotels/providers/:provider/test-connection')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_MODULES)
  @ResponseMessage('Hotels provider connection tested.')
  testHotelsProviderConnection(
    @Param('provider') provider: 'hotelbeds' | 'ratehawk' | 'amadeus' | 'travelport-stays',
  ) {
    return this.service.testHotelsProviderConnection(provider);
  }

  @Get('hotels/providers/:provider')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Hotels provider config retrieved.')
  async getHotelsProvider(
    @Param('provider') provider: 'hotelbeds' | 'ratehawk' | 'amadeus' | 'travelport-stays',
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = await this.service.getHotelsProvider(provider);
    const user = (req as any).user;
    const merged = await this.mergeProviderOverrides(user, req, res, provider, raw as any);
    return merged;
  }

  @Put('hotels/providers/:provider/enabled')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_MODULES)
  @ResponseMessage('Hotels provider enabled status updated.')
  setHotelsProviderEnabled(
    @Param('provider') provider: 'hotelbeds' | 'ratehawk' | 'amadeus' | 'travelport-stays' | 'manual',
    @Body() body: UpdateHotelbedsEnabledDto | UpdateRatehawkEnabledDto | UpdateAmadeusHotelsEnabledDto | UpdateTravelportStaysEnabledDto | UpdateManualEnabledDto,
  ) {
    this.invalidateProviderCaches();
    return this.service.setHotelsProviderEnabled(provider, body.enabled);
  }

  @Put('hotels/providers/:provider/credentials')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_MODULES)
  @ResponseMessage('Hotels provider credentials updated.')
  async setHotelsProviderCredentials(
    @Param('provider') provider: 'hotelbeds' | 'ratehawk' | 'amadeus' | 'travelport-stays',
    @Body() body: UpdateHotelbedsConfigDto | UpdateRatehawkConfigDto | UpdateAmadeusHotelsConfigDto | UpdateTravelportStaysConfigDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = (req as any).user;
    this.assertCanSaveCredentials(user);
    this.invalidateProviderCaches();
    return this.service.setHotelsProviderCredentials(provider, body as any);
  }
}
