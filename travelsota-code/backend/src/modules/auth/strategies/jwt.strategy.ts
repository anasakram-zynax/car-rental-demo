import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AppConfigService } from '../../../shared/config/app-config.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

const USER_CACHE_TTL_MS = 30_000;

interface CachedUser {
  expiresAt: number;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    userType: string;
    deletedAt: Date | null;
    roleId: string | null;
    credentialsVersion: number | undefined;
    role: { name: string } | null;
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  /**
   * Short-TTL cache of validated users. Previously EVERY authenticated
   * request paid a user+role DB round-trip inside the passport strategy —
   * on a chatty admin (sidebar prefetch, polling, refetches) that's
   * dozens of redundant lookups per minute. 30s staleness is acceptable:
   * credential resets bump credentialsVersion AND tokens are verified
   * cryptographically on every request; a revoked user lingers <=30s.
   */
  private static userCache = new Map<string, CachedUser>();
  // Expired entries are never read again but also never deleted — sweep them
  // opportunistically so the Map can't grow without bound.
  private static readonly USER_CACHE_MAX = 1000;

  constructor(
    configService: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.cookies?.access_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.auth.jwtSecret,
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload) {
    const cached = JwtStrategy.userCache.get(payload.sub);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.user, role: cached.user.role?.name ?? null, userType: cached.user.userType };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        userType: true,
        deletedAt: true,
        roleId: true,
        credentialsVersion: true,
        role: { select: { name: true } },
      },
    });

    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('User not found or inactive');
    }

    JwtStrategy.userCache.set(payload.sub, {
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
      user,
    });
    if (JwtStrategy.userCache.size > JwtStrategy.USER_CACHE_MAX) {
      const now = Date.now();
      for (const [key, entry] of JwtStrategy.userCache) {
        if (entry.expiresAt <= now) JwtStrategy.userCache.delete(key);
      }
    }

    // Credential reset bumped the version → this token was issued before the reset → reject.
    if (payload.credentialsVersion !== undefined && user.credentialsVersion !== payload.credentialsVersion) {
      throw new UnauthorizedException('Credentials have been updated. Please sign in again.');
    }

    return { ...user, role: user.role?.name ?? null, userType: user.userType };
  }
}
