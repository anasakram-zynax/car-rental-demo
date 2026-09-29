import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserTypesGuard } from '../../../shared/auth/user-types.guard';
import { CarsAdminController } from './cars-admin.controller';

describe('CarsAdminController authorization', () => {
  const userTypesGuard = new UserTypesGuard(new Reflector());

  function context(user?: { userType: string }): ExecutionContext {
    return {
      getType: () => 'http',
      getHandler: () => CarsAdminController.prototype.list,
      getClass: () => CarsAdminController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('registers an explicit passport authentication guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      CarsAdminController,
    ) as unknown[];
    expect(guards).toHaveLength(1);
    expect(guards[0]).toBeDefined();
  });

  it('rejects an unauthenticated request', () => {
    expect(() => userTypesGuard.canActivate(context())).toThrow(
      'Authentication required.',
    );
  });

  it('rejects a customer', () => {
    expect(() =>
      userTypesGuard.canActivate(context({ userType: 'CUSTOMER' })),
    ).toThrow('Requires one of user types: admin');
  });

  it('allows an authenticated admin staff user', () => {
    expect(userTypesGuard.canActivate(context({ userType: 'STAFF' }))).toBe(
      true,
    );
  });
});
