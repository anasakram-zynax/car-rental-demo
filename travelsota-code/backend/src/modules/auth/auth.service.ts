import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../shared/errors/business-error';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'node:crypto';
import { AppConfigService } from '../../shared/config/app-config.service';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { PermissionCheckService } from '../access-control/application/services/permission-check.service';
import { EmailService } from '../email/application/email.service';
import { EmailTemplateKey } from '../email/domain/email-template-key.enum';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { AgentRegisterDto } from './dto/agent-register.dto';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 15 * 60;
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const FORGOT_PASSWORD_RATE_LIMIT_MS = 60 * 1000; // 1 minute between requests

@Injectable()
export class AuthService {
  private readonly refreshExpiryMs: number;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: AppConfigService,
    private readonly cacheService: CacheService,
    private readonly permissionCheck: PermissionCheckService,
    private readonly emailService: EmailService,
  ) {
    this.refreshExpiryMs = this.parseExpiry(
      configService.auth.jwtRefreshExpiry,
    );
  }

  async register(dto: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BusinessError('AUTH_EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        userType: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      null,
      'CUSTOMER',
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: null,
        userType: 'CUSTOMER',
        permissions: [],
      },
      ...tokens,
    };
  }

  async handleGoogleLogin(
    profile: {
      googleId: string;
      email: string;
      firstName?: string | null;
      lastName?: string | null;
      avatarUrl?: string | null;
    },
    mode: 'signin' | 'signup' = 'signin',
    role?: 'customer' | 'agent',
  ) {
    const userType = role === 'agent' ? 'AGENT' : 'CUSTOMER';

    // 1. Find by Google ID (existing Google user)
    let user = await this.prisma.user.findFirst({
      where: { googleId: profile.googleId },
      include: { role: true },
    });

    if (user) {
      if (mode === 'signup') {
        throw new BusinessError(
          'AUTH_EMAIL_EXISTS',
          'An account with this Google account already exists. Please sign in instead.',
        );
      }

      this.logger.log(`Google login: found existing Google user ${user.id}`);

      // Update avatar if changed
      if (profile.avatarUrl && user.avatarUrl !== profile.avatarUrl) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: profile.avatarUrl },
          include: { role: true },
        });
      }

      return this.completeGoogleLogin(user);
    }

    // 2. Find by email (existing account)
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: { role: true },
    });

    if (existingByEmail) {
      if (mode === 'signup') {
        throw new BusinessError(
          'AUTH_EMAIL_EXISTS',
          'An account with this email already exists. Please sign in instead.',
        );
      }

      if (!existingByEmail.googleId) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleId: profile.googleId,
            avatarUrl: profile.avatarUrl,
            firstName: existingByEmail.firstName ?? profile.firstName,
            lastName: existingByEmail.lastName ?? profile.lastName,
          },
          include: { role: true },
        });
      } else {
        user = existingByEmail;
      }

      this.logger.log(
        `Google login: signed in existing user ${user.id} via email match`,
      );
      return this.completeGoogleLogin(user);
    }

    // 3. New user
    if (mode === 'signin') {
      throw new BusinessError(
        'AUTH_USER_NOT_FOUND',
        'No account found with this email. Please sign up first.',
      );
    }

    // signup mode — create new account
    user = await this.prisma.user.create({
      data: {
        email: profile.email,
        googleId: profile.googleId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatarUrl: profile.avatarUrl,
        userType,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      include: { role: true },
    });

    if (role === 'agent') {
      await this.prisma.agentProfile.create({
        data: {
          userId: user.id,
          companyName: '',
          kycStatus: 'PENDING',
          isApproved: false,
        },
      });
    }

    this.logger.log(`Google signup: created new ${userType} user ${user.id}`);
    return this.completeGoogleLogin(user);
  }

  private async completeGoogleLogin(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    role: { name: string } | null;
    userType: string;
  }) {
    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const roleName = user.role?.name ?? null;
    const permissions = await this.permissionCheck.getEffectivePermissions(user.id);
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      roleName,
      user.userType,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        role: roleName,
        userType: user.userType,
        permissions,
      },
      ...tokens,
    };
  }

  async login(dto: { email: string; password: string }) {
    await this.checkLockout(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true, agentProfile: { select: { isApproved: true, kycStatus: true, parentAgentId: true } } },
    });

    if (!user) {
      await this.recordFailedAttempt(dto.email);
      throw new BusinessError('AUTH_INVALID_CREDENTIALS');
    }

    if (user.status !== 'ACTIVE') {
      throw new BusinessError('AUTH_ACCOUNT_INACTIVE');
    }

    if (user.deletedAt) {
      throw new BusinessError('AUTH_ACCOUNT_DELETED');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.recordFailedAttempt(dto.email);
      throw new BusinessError('AUTH_INVALID_CREDENTIALS');
    }

    await this.clearLockout(dto.email);

    // Update last login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const userType = user.userType;
    const roleName = user.role?.name ?? null;
    const permissions = user.role
      ? await this.permissionCheck.getEffectivePermissions(user.id)
      : [];

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      roleName,
      userType,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType,
        role: roleName,
        permissions,
        isApproved: user.agentProfile?.isApproved ?? null,
        kycStatus: user.agentProfile?.kycStatus ?? null,
        parentAgentId: user.agentProfile?.parentAgentId ?? null,
      },
      ...tokens,
    };
  }

  private async checkLockout(email: string): Promise<void> {
    const cacheKey = `auth:lockout:email:${email.toLowerCase()}`;
    const attempts = await this.cacheService.get<number>(cacheKey);
    if (attempts != null && attempts >= MAX_LOGIN_ATTEMPTS) {
      throw new HttpException(
        {
          message: `Account temporarily locked due to too many failed attempts. Try again in ${LOCKOUT_DURATION_SECONDS / 60} minutes.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailedAttempt(email: string): Promise<void> {
    const cacheKey = `auth:lockout:email:${email.toLowerCase()}`;
    const attempts = (await this.cacheService.get<number>(cacheKey)) ?? 0;
    await this.cacheService.set(
      cacheKey,
      attempts + 1,
      LOCKOUT_DURATION_SECONDS,
    );
  }

  private async clearLockout(email: string): Promise<void> {
    const cacheKey = `auth:lockout:email:${email.toLowerCase()}`;
    await this.cacheService.del(cacheKey);
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { role: true } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new BusinessError('AUTH_TOKEN_EXPIRED');
    }

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new BusinessError('AUTH_TOKEN_REUSE');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role?.name ?? null,
      stored.user.userType,
    );

    return tokens;
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async registerAgent(dto: AgentRegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BusinessError('AUTH_EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user with AGENT type
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.contactName,
        userType: 'AGENT',
        status: 'ACTIVE',
      },
    });

    // Agents require manual KYC approval by an admin.
    // Set AGENT_AUTO_APPROVE=true to skip approval (dev convenience only).
    const autoApprove = process.env.AGENT_AUTO_APPROVE === 'true';

    await this.prisma.agentProfile.create({
      data: {
        userId: user.id,
        companyName: dto.companyName,
        companyPhone: dto.companyPhone ?? null,
        companyAddress: dto.companyAddress ?? null,
        taxId: dto.taxId ?? null,
        kycStatus: autoApprove ? 'APPROVED' : 'PENDING',
        isApproved: autoApprove,
      },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      null,
      'AGENT',
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        userType: 'AGENT',
        role: null,
        permissions: [],
        isApproved: autoApprove,
        kycStatus: autoApprove ? 'APPROVED' : 'PENDING',
      },
      ...tokens,
    };
  }

  /**
   * Compute effective permissions from a user record that includes role.permissions and agentProfile.
   * Reuses the same logic as PermissionCheckService.getEffectivePermissions but avoids a separate DB query.
   */
  private computePermissions(user: {
    userType: string;
    role?: {
      permissions: Array<{ permission: { code: string } }>;
    } | null;
    agentProfile?: { permissionOverrides: unknown } | null;
  }): string[] {
    if (user.userType === 'STAFF' && user.role) {
      return user.role.permissions.map((rp) => rp.permission.code);
    }

    if (user.userType === 'AGENT') {
      const rolePerms = user.role
        ? user.role.permissions.map((rp) => rp.permission.code)
        : [];

      const overrides = user.agentProfile?.permissionOverrides as
        | { grant?: string[]; revoke?: string[] }
        | undefined;

      if (!overrides) return rolePerms;

      const granted = new Set(rolePerms);
      if (overrides.grant) {
        for (const code of overrides.grant) granted.add(code);
      }
      if (overrides.revoke) {
        for (const code of overrides.revoke) granted.delete(code);
      }
      return [...granted];
    }

    return [];
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        phone: true,
        dateOfBirth: true,
        nationality: true,
        preferredCurrency: true,
        preferredLanguage: true,
        status: true,
        userType: true,
        createdAt: true,
        role: {
          select: {
            name: true,
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
        agentProfile: {
          select: {
            permissionOverrides: true,
            isApproved: true,
            kycStatus: true,
            parentAgentId: true,
          },
        },
      },
    });

    if (!user) {
      throw new BusinessError('AUTH_USER_NOT_FOUND');
    }

    const permissions = this.computePermissions(user);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      nationality: user.nationality,
      preferredCurrency: user.preferredCurrency,
      preferredLanguage: user.preferredLanguage,
      status: user.status,
      userType: user.userType,
      role: user.role?.name ?? null,
      permissions,
      createdAt: user.createdAt,
      isApproved: user.agentProfile?.isApproved ?? null,
      kycStatus: user.agentProfile?.kycStatus ?? null,
      parentAgentId: user.agentProfile?.parentAgentId ?? null,
    };
  }

  async updateProfile(
    userId: string,
    dto: {
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      dateOfBirth?: string | null;
      nationality?: string | null;
      preferredCurrency?: string | null;
      preferredLanguage?: string | null;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BusinessError('AUTH_USER_NOT_FOUND');
    if (user.deletedAt) throw new BusinessError('AUTH_ACCOUNT_DELETED');

    const data: Record<string, unknown> = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.dateOfBirth !== undefined)
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.nationality !== undefined) data.nationality = dto.nationality;
    if (dto.preferredCurrency !== undefined) data.preferredCurrency = dto.preferredCurrency;
    if (dto.preferredLanguage !== undefined) data.preferredLanguage = dto.preferredLanguage;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        dateOfBirth: true,
        nationality: true,
        preferredCurrency: true,
        preferredLanguage: true,
        userType: true,
        createdAt: true,
      },
    });

    this.logger.log(`Profile updated: userId=${userId}`);
    return updated;
  }

  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BusinessError('AUTH_USER_NOT_FOUND');
    if (user.deletedAt) throw new BusinessError('AUTH_ACCOUNT_DELETED');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BusinessError('AUTH_INVALID_CURRENT_PASSWORD');

    const sameAsOld = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (sameAsOld) throw new BusinessError('AUTH_PASSWORD_SAME_AS_OLD');

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all refresh tokens for this user (force re-login on other devices)
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Send notification email (best-effort, don't fail the operation)
    this.emailService
      .createAndQueueEmail({
        type: 'password.changed',
        templateKey: EmailTemplateKey.PASSWORD_CHANGED,
        idempotencyKey: `password-changed-${userId}-${Date.now()}`,
        data: { email: user.email, firstName: user.firstName ?? 'there' },
        aggregateType: 'user',
        aggregateId: userId,
      })
      .catch((err) =>
        this.logger.warn(
          `Failed to send password-changed email: ${err.message}`,
        ),
      );

    this.logger.log(`Password changed: userId=${userId}`);
  }

  async forgotPassword(email: string) {
    const rateLimitKey = `auth:forgot-pwd:rate:${email.toLowerCase()}`;
    const recentRequest = await this.cacheService.get<boolean>(rateLimitKey);
    if (recentRequest) {
      // Always return success to prevent email enumeration
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user || user.deletedAt) {
      await this.cacheService.set(rateLimitKey, true, 60);
      return;
    }

    // Generate token: SHA-256 of a random UUID
    const rawToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpiry: expiresAt,
      },
    });

    await this.cacheService.set(
      rateLimitKey,
      true,
      FORGOT_PASSWORD_RATE_LIMIT_MS,
    );

    // Send reset email (best-effort)
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    this.emailService
      .createAndQueueEmail({
        type: 'password.reset.requested',
        templateKey: EmailTemplateKey.PASSWORD_RESET_REQUESTED,
        idempotencyKey: `pwd-reset-${user.id}-${Date.now()}`,
        data: {
          email: user.email,
          firstName: user.firstName ?? 'there',
          resetUrl,
          expiresInMinutes: 60,
        },
        aggregateType: 'user',
        aggregateId: user.id,
      })
      .catch((err) =>
        this.logger.warn(
          `Failed to send forgot-password email: ${err.message}`,
        ),
      );

    this.logger.log(`Password reset requested: userId=${user.id}`);
  }

  async verifyResetToken(token: string): Promise<boolean> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpiry: { gt: new Date() },
        deletedAt: null,
      },
    });

    return !!user;
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpiry: { gt: new Date() },
        deletedAt: null,
      },
    });

    if (!user) throw new BusinessError('AUTH_PASSWORD_RESET_INVALID');

    const sameAsOld = await bcrypt.compare(newPassword, user.passwordHash);
    if (sameAsOld) throw new BusinessError('AUTH_PASSWORD_SAME_AS_OLD');

    const newHash = await bcrypt.hash(newPassword, 12);

    // Atomic claim: only one request can consume the token
    const { count } = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        passwordResetToken: tokenHash,
        passwordResetExpiry: { gt: new Date() },
      },
      data: {
        passwordHash: newHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    if (count === 0) {
      throw new BusinessError('AUTH_PASSWORD_RESET_INVALID');
    }

    // Revoke all refresh tokens (force re-login everywhere)
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Send confirmation email (best-effort)
    this.emailService
      .createAndQueueEmail({
        type: 'password.reset.confirmed',
        templateKey: EmailTemplateKey.PASSWORD_RESET_CONFIRMED,
        idempotencyKey: `pwd-reset-confirmed-${user.id}-${Date.now()}`,
        data: { email: user.email, firstName: user.firstName ?? 'there' },
        aggregateType: 'user',
        aggregateId: user.id,
      })
      .catch((err) =>
        this.logger.warn(
          `Failed to send reset-confirmed email: ${err.message}`,
        ),
      );

    this.logger.log(`Password reset completed: userId=${user.id}`);
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string | null,
    userType: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credentialsVersion: true },
    });

    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      userType,
      credentialsVersion: user?.credentialsVersion ?? 0,
    };

    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = randomUUID();
    const expiresAt = new Date(Date.now() + this.refreshExpiryMs);

    await this.prisma.refreshToken.create({
      data: {
        token: rawRefreshToken,
        userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  // ──────────────────────────────────────────────
  // Email verification (OTP skeleton)
  // ──────────────────────────────────────────────

  /** Generate and store a 6-digit verification code for the given user */
  async generateEmailVerificationToken(userId: string): Promise<string> {
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: token,
        emailVerificationExpiry: expires,
      },
    });

    // TODO: send via EmailService (await this.emailService.sendVerification(userId, token))
    this.logger.log(`Email verification token generated for user ${userId}`);

    return token;
  }

  /** Verify that the supplied token matches and hasn't expired */
  async verifyEmailToken(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerificationToken: true,
        emailVerificationExpiry: true,
      },
    });

    if (
      !user ||
      !user.emailVerificationToken ||
      !user.emailVerificationExpiry ||
      user.emailVerificationExpiry < new Date() ||
      user.emailVerificationToken !== token
    ) {
      return false;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        emailVerifiedAt: new Date(),
      },
    });

    return true;
  }
}
