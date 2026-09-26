import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { AgentProfileService } from '../../access-control/application/services/agent-profile.service';
import { UserManagementService } from '../../access-control/application/services/user-management.service';
import { MarkupService } from '../../markup/markup.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { BusinessError } from '../../../shared/errors/business-error';

@Controller('agents')
@UserTypes('agent')
export class AgentPanelController {
  constructor(
    private readonly agentProfileService: AgentProfileService,
    private readonly userManagement: UserManagementService,
    private readonly markupService: MarkupService,
  ) {}

  @Get('profile')
  @ResponseMessage('Agent profile fetched.')
  async getProfile(@CurrentUser() user: { id: string }) {
    const detail = await this.userManagement.getAgentDetail(user.id);
    if (!detail) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    return detail;
  }

  /**
   * Control surface for the agent UI: which suppliers/gateways this agent
   * may use (null = all allowed). The booking backend enforces the same
   * lists — the UI mirrors them so disallowed options never appear.
   */
  @Get('access')
  @ResponseMessage('Agent access surface retrieved.')
  async getAccess(@CurrentUser() user: { id: string }) {
    const profile = await this.agentProfileService.findByUserId(user.id);
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    return {
      allowedFlightProviders: profile.allowedFlightProviders ?? null,
      allowedHotelProviders: profile.allowedHotelProviders ?? null,
      allowedGateways: profile.allowedGateways ?? null,
    };
  }

  @Get('markup-rules')
  @ResponseMessage('Agent markup rules fetched.')
  async getMarkupRules(@CurrentUser() user: { id: string }) {
    const detail = await this.userManagement.getAgentDetail(user.id);
    if (!detail?.agentProfile) return [];
    return this.markupService.findByAgentId(detail.agentProfile.id);
  }

  @Patch('profile')
  @ResponseMessage('Agent profile updated.')
  async updateProfile(
    @CurrentUser() user: { id: string },
    @Body() body: { companyName?: string; companyPhone?: string; companyAddress?: string; taxId?: string },
    @Req() req: any,
  ) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.agentProfileService.upsert(user.id, body, user.id, ip, ua);
  }
}
