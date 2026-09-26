import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Restricts demo-operations endpoints (Demo Leads, Reset Console).
 * Two layers:
 *  1. DEMO_UI_ENABLED=false disables the whole demo surface for everyone.
 *  2. REAL_ADMIN_EMAIL limits access to exactly one real super-admin account.
 */
@Injectable()
export class RealAdminGuard implements CanActivate {
  private readonly targetEmail: string;
  private readonly uiEnabled: boolean;

  constructor() {
    this.targetEmail = (process.env.REAL_ADMIN_EMAIL || 'superadmin@travelsota-dev.local')
      .trim()
      .toLowerCase();
    this.uiEnabled = process.env.DEMO_UI_ENABLED !== 'false';
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.uiEnabled) {
      throw new ForbiddenException(
        'Demo operations are disabled on this deployment.',
      );
    }
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { email?: string } }>();
    const email = (request?.user?.email ?? '').trim().toLowerCase();
    if (email !== this.targetEmail) {
      throw new ForbiddenException(
        'This area is restricted to the real super administrator.',
      );
    }
    return true;
  }
}
