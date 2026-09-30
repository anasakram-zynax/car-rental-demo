import { GUARDS_METADATA } from '@nestjs/common/constants';
import { USER_TYPES_KEY } from '../../../shared/auth/user-types.decorator';
import { CarsPublicController } from './cars-public.controller';
import { GuestBookingGuard } from '../../settings/api/guards/guest-booking.guard';
import { UnauthorizedException } from '@nestjs/common';

describe('Cars checkout route authorization', () => {
  it('uses the existing guest-booking guard without requiring a user type', () => {
    const checkout = CarsPublicController.prototype.checkout;
    const guards = Reflect.getMetadata(GUARDS_METADATA, checkout) as unknown[];
    const userTypes = Reflect.getMetadata(USER_TYPES_KEY, checkout) as string[];
    expect(guards).toHaveLength(1);
    expect(guards[0]).toBe(GuestBookingGuard);
    expect(userTypes).toBeUndefined();
  });

  it('allows guests when guest booking is enabled and rejects them when disabled', async () => {
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user: undefined }) }),
    } as never;
    const enabled = new GuestBookingGuard({
      get: jest.fn().mockResolvedValue(true),
    } as never);
    const disabled = new GuestBookingGuard({
      get: jest.fn().mockResolvedValue(false),
    } as never);
    await expect(enabled.canActivate(context)).resolves.toBe(true);
    await expect(disabled.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('passes optional customer ownership and rejects authenticated non-customers', async () => {
    const checkoutService = { checkout: jest.fn().mockResolvedValue({}) };
    const controller = new CarsPublicController(
      {} as never,
      checkoutService as never,
      {} as never,
    );
    await controller.checkout({} as never, undefined);
    await controller.checkout({} as never, {
      id: 'customer-1',
      userType: 'CUSTOMER',
    });
    expect(checkoutService.checkout).toHaveBeenNthCalledWith(1, {}, undefined);
    expect(checkoutService.checkout).toHaveBeenNthCalledWith(
      2,
      {},
      'customer-1',
    );
    expect(() =>
      controller.checkout({} as never, { id: 'agent-1', userType: 'AGENT' }),
    ).toThrow('Cars checkout is available to customers and guests only.');
  });

  it('protects customer cancellation with the same authenticated identity policy', () => {
    const cancel = CarsPublicController.prototype.cancelBooking;
    const guards = Reflect.getMetadata(GUARDS_METADATA, cancel) as unknown[];
    const userTypes = Reflect.getMetadata(USER_TYPES_KEY, cancel) as string[];
    expect(guards).toHaveLength(1);
    expect(userTypes).toEqual(['customer']);
  });
});
