import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { AgentProfileService } from '../../application/services/agent-profile.service';
import { UserManagementService } from '../../application/services/user-management.service';
import { UpsertAgentProfileDto } from '../dto/upsert-agent-profile.dto';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { PermissionCode } from '../../domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import type { KycStatusType } from '../../domain/agent-profile.entity';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  MinLength,
  IsArray,
  IsNumber,
  Min,
} from 'class-validator';
import {
  MarkupService,
  type MarkupRuleEntity,
} from '../../../markup/markup.service';
import { Type } from 'class-transformer';

// Inline DTO for reject body
class RejectAgentDto {
  @IsString()
  @MinLength(1)
  reason: string;
}

// Inline DTO for role assignment
class AssignAgentRoleDto {
  @IsString()
  roleId: string;
}

// Inline DTO for permission overrides
class PermissionOverridesDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grant?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  revoke?: string[];
}

// Inline DTO for list filters
class AgentListQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  kycStatus?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
}

// Inline DTO for bulk markup assignment (defined before controller to avoid circular decorator reference in CommonJS)
class MarkupItemDto {
  @IsOptional() @IsString() id?: string;
  @IsString() name: string;
  @IsString() @IsIn(['flights', 'hotels', 'packages', 'all']) applyTo:
    | 'flights'
    | 'hotels'
    | 'packages'
    | 'all';
  @IsString() @IsIn(['percentage']) markupType: 'percentage';
  @IsNumber() @Min(0) markupValue: number;
  @IsOptional() @IsString() routeFrom?: string;
  @IsOptional() @IsString() routeTo?: string;
}

class BulkMarkupDto {
  @Type(() => MarkupItemDto)
  markups: MarkupItemDto[];
}

@Controller('admin/agents')
@UserTypes('admin')
export class AgentController {
  constructor(
    private readonly agentProfileService: AgentProfileService,
    private readonly userManagement: UserManagementService,
    private readonly markupService: MarkupService,
  ) {}

  @Get()
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Agents listed.')
  async findAll(@Query() query: AgentListQueryDto) {
    return this.userManagement.getAgents({
      kycStatus: query.kycStatus as KycStatusType | undefined,
      search: query.search,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
  }

  @Get(':userId')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Agent profile retrieved.')
  async findByUserId(@Param('userId') userId: string) {
    return this.userManagement.getAgentDetail(userId);
  }

  @Patch(':userId')
  @RequirePermission(PermissionCode.AGENTS_WRITE)
  @ResponseMessage('Agent profile updated.')
  async upsert(
    @Param('userId') userId: string,
    @Body() dto: UpsertAgentProfileDto,
    @Req() req: any,
  ) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.agentProfileService.upsert(userId, dto, req.user?.id, ip, ua);
  }

  @Post(':userId/approve')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Agent approved.')
  async approve(@Param('userId') userId: string, @Req() req: any) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.agentProfileService.approve(userId, req.user?.id, ip, ua);
  }

  @Post(':userId/reject')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Agent rejected.')
  async reject(
    @Param('userId') userId: string,
    @Body() dto: RejectAgentDto,
    @Req() req: any,
  ) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.agentProfileService.reject(
      userId,
      dto.reason,
      req.user?.id,
      ip,
      ua,
    );
  }

  @Post(':userId/suspend')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Agent suspended.')
  async suspend(
    @Param('userId') userId: string,
    @Body() dto: { reason?: string },
    @Req() req: any,
  ) {
    return this.agentProfileService.suspend(userId, dto?.reason, req.user?.id, req.ip, req.headers['user-agent']);
  }

  @Post(':userId/unsuspend')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Agent re-activated.')
  async unsuspend(@Param('userId') userId: string, @Req() req: any) {
    return this.agentProfileService.unsuspend(userId, req.user?.id, req.ip, req.headers['user-agent']);
  }

  @Put(':userId/role')
  @RequirePermission(PermissionCode.USERS_MANAGE_ROLES)
  @ResponseMessage('Agent role assigned.')
  async assignRole(
    @Param('userId') userId: string,
    @Body() dto: AssignAgentRoleDto,
    @Req() req: any,
  ) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.userManagement.assignAgentRole(
      userId,
      dto.roleId,
      req.user?.id,
      ip,
      ua,
    );
  }

  @Put(':userId/permission-overrides')
  @RequirePermission(PermissionCode.USERS_MANAGE_ROLES)
  @ResponseMessage('Agent permission overrides updated.')
  async setPermissionOverrides(
    @Param('userId') userId: string,
    @Body() dto: PermissionOverridesDto,
    @Req() req: any,
  ) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    const overrides =
      dto.grant || dto.revoke
        ? { grant: dto.grant ?? [], revoke: dto.revoke ?? [] }
        : null;
    await this.userManagement.setAgentPermissionOverrides(
      userId,
      overrides,
      req.user?.id,
      ip,
      ua,
    );
    return { success: true };
  }

  @Get(':userId/effective-permissions')
  @RequirePermission(PermissionCode.USERS_MANAGE_ROLES)
  @ResponseMessage('Effective permissions retrieved.')
  async getEffectivePermissions(@Param('userId') userId: string) {
    return this.userManagement.getAgentEffectivePermissions(userId);
  }

  @Get(':userId/markups')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Agent markup rules retrieved.')
  async getMarkups(
    @Param('userId') userId: string,
  ): Promise<MarkupRuleEntity[]> {
    const detail = await this.userManagement.getAgentDetail(userId);
    if (!detail) throw new Error('Agent not found');
    return this.markupService.findByAgentId(detail.agentProfile?.id ?? userId);
  }

  @Put(':userId/markups')
  @RequirePermission(PermissionCode.AGENTS_WRITE)
  @ResponseMessage('Agent markup rules updated.')
  async setMarkups(
    @Param('userId') userId: string,
    @Body() dto: BulkMarkupDto,
  ): Promise<MarkupRuleEntity[]> {
    const detail = await this.userManagement.getAgentDetail(userId);
    if (!detail) throw new Error('Agent not found');
    const agentId = detail.agentProfile?.id ?? userId;
    return this.markupService.bulkAssignAgentMarkups(agentId, dto.markups);
  }
}
