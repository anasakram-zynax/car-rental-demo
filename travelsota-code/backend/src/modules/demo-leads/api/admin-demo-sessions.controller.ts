import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { DemoSessionService } from '../application/demo-session.service';
import { RealAdminGuard } from './real-admin.guard';

/**
 * Demo-traffic analytics — restricted to the single real super admin
 * (RealAdminGuard: REAL_ADMIN_EMAIL). NOT gated by DEMO_UI_ENABLED so
 * historical analytics remain visible after the demo surface is switched off.
 */
@UserTypes('admin')
@UseGuards(RealAdminGuard)
@Controller('admin/demo-sessions')
export class AdminDemoSessionsController {
  constructor(private readonly service: DemoSessionService) {}

  @Get('summary')
  @ResponseMessage('Demo traffic summary retrieved.')
  async summary() {
    return this.service.getSummary();
  }

  /** Live feed: what actively exploring visitors are doing right now. */
  @Get('watch-now')
  @ResponseMessage('Live demo watch feed retrieved.')
  async watchNow() {
    return this.service.watchNow();
  }

  @Get()
  @ResponseMessage('Demo sessions retrieved.')
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('demoRole') demoRole?: string,
    @Query('visitorId') visitorId?: string,
  ) {
    return this.service.listSessions({
      page: Math.max(1, parseInt(page ?? '1', 10) || 1),
      pageSize: Math.min(200, Math.max(1, parseInt(limit ?? '20', 10) || 20)),
      demoRole: demoRole || undefined,
      visitorId: visitorId || undefined,
    });
  }

  /** What a visitor did across ALL their sessions (newest first). */
  @Get('visitor/:visitorId/activities')
  @ResponseMessage('Demo visitor activities retrieved.')
  async visitorActivities(@Param('visitorId') visitorId: string) {
    return this.service.listVisitorActivities(visitorId);
  }

  /** What the visitor did during one session (newest first). */
  @Get(':sessionId/activities')
  @ResponseMessage('Demo session activities retrieved.')
  async sessionActivities(@Param('sessionId') sessionId: string) {
    return this.service.listSessionActivities(sessionId);
  }
}
