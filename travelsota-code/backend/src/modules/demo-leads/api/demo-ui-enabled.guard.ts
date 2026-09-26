import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Gates the public demo surface (quick credentials + session tracking) behind
 * DEMO_UI_ENABLED. The super-admin Leads tab is intentionally NOT gated by
 * this flag — historical analytics stay available to the real admin.
 */
@Injectable()
export class DemoUiEnabledGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.DEMO_UI_ENABLED === 'false') {
      throw new ForbiddenException(
        'Demo access is disabled on this deployment.',
      );
    }
    return true;
  }
}
