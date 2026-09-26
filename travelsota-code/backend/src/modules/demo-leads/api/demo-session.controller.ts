import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { OptionalJwtAuthGuard } from '../../../shared/auth/optional-jwt-auth.guard';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import {
  DemoSessionService,
  type DemoRole,
} from '../application/demo-session.service';
import { DemoUiEnabledGuard } from './demo-ui-enabled.guard';

export class StartDemoSessionDto {
  @IsUUID(undefined, { message: 'visitorId must be a UUID.' })
  visitorId!: string;
}

export class HeartbeatDemoSessionDto {
  @IsUUID()
  sessionId!: string;
}

export class EndDemoSessionDto {
  @IsUUID()
  sessionId!: string;
}

export class RecordDemoActivityDto {
  @IsUUID()
  sessionId!: string;

  @IsIn(['page'])
  type!: 'page';

  @IsString()
  @Length(1, 300)
  label!: string;
}

export class IdentifyVisitorDto {
  @IsUUID(undefined, { message: 'visitorId must be a UUID.' })
  visitorId!: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email!: string;

  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
}

/** Minimal shape of the JWT payload the auth guard attaches to req.user. */
function jwtUser(req: Request): { id?: string; email?: string } | undefined {
  return (req as unknown as { user?: { id?: string; email?: string } }).user;
}

@Controller('public/demo')
@UseGuards(DemoUiEnabledGuard)
export class DemoSessionController {
  constructor(private readonly service: DemoSessionService) {}

  /** Credentials for the sign-in form prefill buttons (public by design). */
  @Get('quick-credentials')
  @ResponseMessage('Demo credentials retrieved.')
  async quickCredentials() {
    return this.service.getQuickCredentials();
  }

  /** Start a tracking session — JWT must belong to a demo account. */
  @Post('sessions/start')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  @ResponseMessage('Demo session started.')
  async start(
    @Req() req: Request,
    @Ip() ipAddress: string,
    @Body() dto: StartDemoSessionDto,
  ) {
    const email = jwtUser(req)?.email;
    const resolved = this.service.resolveDemoRole(email);
    if (!resolved) {
      // Not a demo account — respond neutrally so the UI can skip tracking.
      return { sessionId: null, tracked: false };
    }
    const result = await this.service.startSession({
      demoRole: resolved.role,
      userId: jwtUser(req)?.id ?? '',
      visitorId: dto.visitorId,
      ipAddress,
      userAgent: req.headers['user-agent'],
    });
    return { ...result, tracked: true };
  }

  /** Heartbeat — JWT must belong to a demo account that owns the session. */
  @Post('sessions/heartbeat')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  async heartbeat(
    @Req() req: Request,
    @Ip() ipAddress: string,
    @Body() dto: HeartbeatDemoSessionDto,
  ) {
    const email = jwtUser(req)?.email;
    const resolved = this.service.resolveDemoRole(email);
    const userId = jwtUser(req)?.id;
    if (!resolved || !userId) return { ok: false, reason: 'untracked' };
    return this.service.heartbeat({
      sessionId: dto.sessionId,
      userId,
      ipAddress,
    });
  }

  /**
   * End a session — no auth (sendBeacon cannot set Authorization headers).
   * Only effect: freezing the session's stats. sessionId is an unguessable UUID.
   */
  @Post('sessions/end')
  @HttpCode(200)
  async end(@Body() dto: EndDemoSessionDto) {
    return this.service.endSession(dto.sessionId);
  }

  /** Optional identify-later prompt — attaches an email lead to the visitor. */
  /** Record a page-view (tab opened) for the session — tracker beacon. */
  @Post('activities')
  @HttpCode(200)
  async recordActivity(@Body() dto: RecordDemoActivityDto) {
    return this.service.recordActivity(dto);
  }

  @Post('identify')
  @HttpCode(200)
  @ResponseMessage('Thank you — we will be in touch.')
  async identify(@Ip() ipAddress: string, @Body() dto: IdentifyVisitorDto) {
    return this.service.identifyVisitor({
      visitorId: dto.visitorId,
      email: dto.email,
      name: dto.name,
      companyName: dto.companyName,
      whatsappNumber: dto.whatsappNumber,
      ipAddress,
    });
  }
}

// Re-exported for the module/controller imports clarity.
export type { DemoRole };
