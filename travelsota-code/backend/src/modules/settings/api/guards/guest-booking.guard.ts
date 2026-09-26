import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SiteSettingStore } from '../../infrastructure/site-setting.store';

/**
 * Guard that checks the `guestBookingEnabled` site setting.
 *
 * - If enabled → request passes through (guest OR authenticated user).
 * - If disabled → user must be authenticated (req.user present).
 *   Throws 401 if no user.
 *
 * Apply to booking-confirmation endpoints that should be gated by the
 * admin Guest Booking toggle.
 */
@Injectable()
export class GuestBookingGuard implements CanActivate {
  constructor(private readonly settings: SiteSettingStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const enabled = await this.settings.get<boolean>('guestBookingEnabled');
    // Default: enabled (guest booking allowed)
    if (enabled !== false) return true;

    // Guest booking disabled — require authenticated user
    const req = context.switchToHttp().getRequest();
    if (!req.user) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Sign in required to complete booking.',
      });
    }
    return true;
  }
}
