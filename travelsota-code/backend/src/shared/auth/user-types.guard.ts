import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { BusinessError } from '../errors/business-error';
import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { USER_TYPES_KEY, type UserTypeRoute } from './user-types.decorator';

@Injectable()
export class UserTypesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const requiredUserTypes =
      this.reflector.getAllAndOverride<UserTypeRoute[]>(USER_TYPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredUserTypes.length === 0) return true;

    if (requiredUserTypes.includes('public')) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new BusinessError('AUTH_REQUIRED');
    }

    const hasType = requiredUserTypes.some((userType) => {
      switch (userType) {
        case 'admin':
          return user.userType === 'STAFF';
        case 'agent':
          return user.userType === 'AGENT';
        case 'customer':
          return user.userType === 'CUSTOMER';
        default:
          return false;
      }
    });

    if (!hasType) {
      throw new BusinessError(
        'AUTH_INSUFFICIENT_PERMISSIONS',
        `Requires one of user types: ${requiredUserTypes.join(', ')}`,
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
