import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubAgentService } from '../../application/services/sub-agent.service';
import { RoleService } from '../../application/services/role.service';
import { AgentProfileService } from '../../application/services/agent-profile.service';
import { CreateSubAgentDto, UpdateSubAgentDto } from '../dto/create-sub-agent.dto';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import { PermissionCode } from '../../domain/enums/permission-code.enum';
import { AgentAuthGuard } from '../../../agent-panel/api/guards/agent-auth.guard';

@Controller('agent/team')
@UseGuards(AuthGuard('jwt'), AgentAuthGuard)
@UserTypes('agent')
@RequirePermission(PermissionCode.AGENT_MANAGE_SUB_AGENTS)
export class AgentTeamController {
  constructor(
    private readonly subAgentService: SubAgentService,
    private readonly roleService: RoleService,
    private readonly agentProfileService: AgentProfileService,
  ) {}

  @Post('create')
  @ResponseMessage('Sub-agent created.')
  async create(@Body() dto: CreateSubAgentDto, @Req() req: any) {
    return this.subAgentService.createSubAgent(req.user.id, dto);
  }

  @Get('stats')
  @ResponseMessage('Team stats retrieved.')
  async stats(@Req() req: any) {
    return this.subAgentService.getTeamStats(req.user.id);
  }
  @ResponseMessage('Available roles listed.')
  async listRoles(@Req() req: any) {
    const allRoles = await this.roleService.findAll();
    const agentRoles = allRoles.filter((r) => r.name.toLowerCase().includes('agent'));
    const profile = await this.agentProfileService.findByUserId(req.user.id);
    if (profile?.allowedSubAgentRoleIds && profile.allowedSubAgentRoleIds.length > 0) {
      return agentRoles.filter((r) => profile.allowedSubAgentRoleIds!.includes(r.id));
    }
    return agentRoles;
  }

  @Get()
  @ResponseMessage('Sub-agents listed.')
  async list(@Req() req: any) {
    return this.subAgentService.listSubAgents(req.user.id);
  }

  @Get(':userId')
  @ResponseMessage('Sub-agent detail retrieved.')
  async detail(@Param('userId') userId: string, @Req() req: any) {
    return this.subAgentService.getSubAgentDetail(userId, req.user.id);
  }

  @Patch(':userId')
  @ResponseMessage('Sub-agent updated.')
  async update(
    @Param('userId') userId: string,
    @Body() dto: UpdateSubAgentDto,
    @Req() req: any,
  ) {
    return this.subAgentService.updateSubAgent(userId, req.user.id, dto);
  }

  @Post(':userId/suspend')
  @ResponseMessage('Sub-agent suspended.')
  async suspend(@Param('userId') userId: string, @Req() req: any) {
    return this.subAgentService.suspendSubAgent(userId, req.user.id);
  }

  @Post(':userId/reactivate')
  @ResponseMessage('Sub-agent reactivated.')
  async reactivate(@Param('userId') userId: string, @Req() req: any) {
    return this.subAgentService.reactivateSubAgent(userId, req.user.id);
  }

  @Delete(':userId')
  @ResponseMessage('Sub-agent removed.')
  async remove(@Param('userId') userId: string, @Req() req: any) {
    return this.subAgentService.removeSubAgent(userId, req.user.id);
  }
}
