import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CommissionService, type PaginatedCommissions, type CommissionSummary } from './commission.service';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../../shared/database/prisma.service';
import { BusinessError } from '../../shared/errors/business-error';
import { IsString, IsOptional, IsNumber, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

class CommissionQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() bookingType?: string;
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
}

class SummaryQueryDto {
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
}

class CommissionWithdrawalDto {
  @IsString() @IsNotEmpty() methodName: string;
  @IsOptional() @IsString() details?: string;
}

@Controller('agent/commissions')
@UserTypes('agent')
export class AgentCommissionController {
  constructor(
    private readonly commissionService: CommissionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ResponseMessage('Commission records retrieved.')
  async getCommissions(
    @CurrentUser() user: { id: string },
    @Query() query: CommissionQueryDto,
  ): Promise<PaginatedCommissions | { message: string }> {
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) return { message: 'Agent profile not found' };
    return this.commissionService.getEarningsPerBooking(agentProfileId, query);
  }

  @Get('summary')
  @ResponseMessage('Commission summary retrieved.')
  async getSummary(
    @CurrentUser() user: { id: string },
    @Query() query: SummaryQueryDto,
  ): Promise<CommissionSummary | { message: string }> {
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) return { message: 'Agent profile not found' } as any;
    return this.commissionService.getAgentCommissionSummary(
      agentProfileId,
      query.fromDate,
      query.toDate,
    );
  }

  @Post('transfer-to-wallet')
  @ResponseMessage('Commission transferred to wallet.')
  async transferToWallet(@CurrentUser() user: { id: string }): Promise<any> {
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    return this.commissionService.transferToWallet(agentProfileId, user.id);
  }

  @Post('withdrawals')
  @ResponseMessage('Commission withdrawal requested — pending admin approval.')
  async requestWithdrawal(
    @CurrentUser() user: { id: string },
    @Body() dto: CommissionWithdrawalDto,
  ): Promise<any> {
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    return this.commissionService.requestOffPlatformWithdrawal(
      agentProfileId,
      dto.methodName,
      dto.details ?? '',
      user.id,
    );
  }

  @Get('withdrawals')
  @ResponseMessage('Commission withdrawal requests retrieved.')
  async listWithdrawals(@CurrentUser() user: { id: string }): Promise<any> {
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) return { message: 'Agent profile not found' };
    return this.commissionService.listOwnCommissionWithdrawals(agentProfileId);
  }

  private async resolveProfileId(userId: string): Promise<string | null> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }
}
