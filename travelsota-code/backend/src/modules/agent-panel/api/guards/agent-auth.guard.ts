import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (user.userType !== 'AGENT') {
      throw new ForbiddenException('Only agents can access this resource');
    }

    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId: user.id },
      select: { isApproved: true, isSuspended: true, kycStatus: true, parentAgentId: true },
    });

    if (!profile) {
      throw new ForbiddenException('Agent profile not found');
    }

    if (!profile.isApproved || profile.kycStatus !== 'APPROVED') {
      throw new ForbiddenException('Agent not yet approved');
    }

    if (profile.isSuspended) {
      throw new ForbiddenException('Agent account is suspended');
    }

    if (profile.parentAgentId) {
      const parentProfile = await this.prisma.agentProfile.findUnique({
        where: { userId: profile.parentAgentId },
        select: { isSuspended: true },
      });
      if (parentProfile?.isSuspended) {
        throw new ForbiddenException('Parent agent account is suspended');
      }
    }

    return true;
  }
}
