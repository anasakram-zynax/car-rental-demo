import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Patch,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CurrencyService } from '../application/services/currency.service';
import { ExchangeRateService } from '../application/services/exchange-rate.service';
import { CurrencyRateSchedulerService } from '../application/services/currency-rate-scheduler.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { UpdateRateScheduleDto } from './dto/update-rate-schedule.dto';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';

@UserTypes('admin')
@Controller('admin/currencies')
export class AdminCurrencyController {
  constructor(
    private readonly currencyService: CurrencyService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly currencyRateScheduler: CurrencyRateSchedulerService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Static routes must come BEFORE :id parameterized routes ──

  @Get()
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Currencies listed.')
  async list() {
    return this.currencyService.listAll();
  }

  @Post()
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Currency created.')
  async create(@Body() dto: CreateCurrencyDto) {
    return this.currencyService.create(dto);
  }

  @Post('update-rates')
  @RequirePermission(PermissionCode.SETTINGS_UPDATE_RATES)
  @ResponseMessage('Exchange rates updated from API.')
  async updateRates() {
    return this.exchangeRateService.updateAllRates('manual');
  }

  // ── Rate Schedule (static paths, must be before :id) ──

  @Get('rate-schedule')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Rate schedule retrieved.')
  async getRateSchedule() {
    return this.currencyRateScheduler.getSchedule();
  }

  @Patch('rate-schedule')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Rate schedule updated.')
  async updateRateSchedule(@Body() dto: UpdateRateScheduleDto) {
    return this.currencyRateScheduler.updateSchedule(dto);
  }

  @Post('rate-schedule/enable')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Rate schedule enabled.')
  async enableRateSchedule() {
    return this.currencyRateScheduler.enableSchedule();
  }

  @Post('rate-schedule/disable')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Rate schedule disabled.')
  async disableRateSchedule() {
    return this.currencyRateScheduler.disableSchedule();
  }

  @Post('rate-schedule/run-now')
  @RequirePermission(PermissionCode.SETTINGS_UPDATE_RATES)
  @ResponseMessage('Scheduled rate update triggered.')
  async runRateScheduleNow() {
    return this.currencyRateScheduler.runNow();
  }

  @Get('rate-schedule/history')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Rate schedule run history retrieved.')
  async getRateScheduleHistory() {
    return this.currencyRateScheduler.getRunHistory(20);
  }

  // ── Audit Trail (static) ──

  @Get('audit/trail')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Exchange rate audit trail retrieved.')
  async auditTrail() {
    return this.prisma.exchangeRateAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Parameterized :id routes ──

  @Get(':id')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Currency details retrieved.')
  async get(@Param('id') id: string) {
    return this.currencyService.getById(id);
  }

  @Put(':id')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Currency updated.')
  async update(@Param('id') id: string, @Body() dto: UpdateCurrencyDto) {
    return this.currencyService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Currency deleted.')
  async remove(@Param('id') id: string) {
    return this.currencyService.delete(id);
  }

  @Post(':id/deactivate')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Currency deactivated.')
  async deactivate(@Param('id') id: string) {
    return this.currencyService.deactivate(id);
  }

  @Post(':id/activate')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Currency activated.')
  async activate(@Param('id') id: string) {
    return this.currencyService.update(id, { isActive: true });
  }

  @Post(':id/set-default')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Default display currency updated.')
  async setDefault(@Param('id') id: string) {
    return this.currencyService.setAsDefault(id);
  }

  @Post(':id/set-base')
  @RequirePermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES)
  @ResponseMessage('Base currency updated.')
  async setBase(@Param('id') id: string) {
    return this.currencyService.setAsBase(id);
  }
}
