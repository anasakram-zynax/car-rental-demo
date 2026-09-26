import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { DashboardService } from '../application/services/dashboard.service';
import { TtlCacheInterceptor } from './ttl-cache.interceptor';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { RevenueQueryDto, RecentActivityQueryDto, TrendPeriodQueryDto } from './dto/dashboard.dto';

@UserTypes('admin')
@Controller('admin/dashboard')
@UseInterceptors(TtlCacheInterceptor)
export class AdminDashboardController {
  constructor(private readonly service: DashboardService) {}

  /**
   * One-shot aggregate for the Dashboard tab's initial paint: stats, bookings
   * trend, revenue by source, 30d revenue trend, customer insights and top
   * destinations in a single parallel batch (per-section failure isolation —
   * see DashboardService.getOverview). The range-dependent sales trend keeps
   * its dedicated endpoint below so range switches stay cheap.
   */
  @Get('overview')
  @RequirePermission(PermissionCode.REPORTS_READ)
  @ResponseMessage('Dashboard overview retrieved.')
  getOverview(@Query() query: TrendPeriodQueryDto) {
    return this.service.getOverview(query.period ?? 'monthly');
  }

  @Get('stats')
  @RequirePermission(PermissionCode.REPORTS_READ)
  @ResponseMessage('Dashboard stats retrieved.')
  getStats() {
    return this.service.getStats();
  }

  @Get('revenue')
  @RequirePermission(PermissionCode.REPORTS_READ)
  @ResponseMessage('Revenue data retrieved.')
  getRevenue(@Query() query: RevenueQueryDto) {
    return this.service.getRevenue(query.range ?? '30d');
  }

  @Get('recent-activity')
  @RequirePermission(PermissionCode.REPORTS_READ)
  @ResponseMessage('Recent activity retrieved.')
  getRecentActivity(@Query() query: RecentActivityQueryDto) {
    return this.service.getRecentActivity(query.limit ?? 15);
  }

  @Get('bookings-trend')
  @RequirePermission(PermissionCode.REPORTS_READ)
  @ResponseMessage('Bookings trend retrieved.')
  getBookingsTrend(@Query() query: TrendPeriodQueryDto) {
    return this.service.getBookingsTrend(query.period ?? 'monthly');
  }

  @Get('revenue-by-source')
  @RequirePermission(PermissionCode.REPORTS_READ)
  @ResponseMessage('Revenue by source retrieved.')
  getRevenueBySource() {
    return this.service.getRevenueBySource();
  }

  @Get('customer-insights')
  @RequirePermission(PermissionCode.REPORTS_READ)
  @ResponseMessage('Customer insights retrieved.')
  getCustomerInsights() {
    return this.service.getCustomerInsights();
  }

  @Get('top-destinations')
  @RequirePermission(PermissionCode.REPORTS_READ)
  @ResponseMessage('Top destinations retrieved.')
  getTopDestinations() {
    return this.service.getTopDestinations();
  }
}
