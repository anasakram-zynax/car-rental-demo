import { Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT guard — extracts the user from the JWT if present and valid,
 * but returns null (instead of throwing) when the token is missing or invalid.
 *
 * When the token is expired, attaches `req.authError = 'TOKEN_EXPIRED'` so that
 * downstream guards (UserTypesGuard) can distinguish "expired" from "missing".
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(OptionalJwtAuthGuard.name);

  handleRequest(err: any, user: any, info: any, context: any) {
    if (err) {
      this.logger.warn(`JWT authentication error: ${err.message}`);
      return null;
    }
    if (!user && info) {
      const msg = info.message ?? 'unknown';
      this.logger.debug(`No user from JWT: ${msg}`);

      // Distinguish token expired from missing token
      if (msg.includes('jwt expired') || msg.includes('token expired')) {
        const req = context?.switchToHttp?.()?.getRequest?.();
        if (req) req.authError = 'TOKEN_EXPIRED';
      }

      return null;
    }
    return user ?? null;
  }
}
