import { GUARDS_METADATA } from '@nestjs/common/constants';
import { USER_TYPES_KEY } from '../../../shared/auth/user-types.decorator';
import { CarsPublicController } from './cars-public.controller';

describe('Cars checkout route authorization', () => {
  it('requires JWT authentication and customer user type', () => {
    const checkout = CarsPublicController.prototype.checkout;
    const guards = Reflect.getMetadata(GUARDS_METADATA, checkout) as unknown[];
    const userTypes = Reflect.getMetadata(USER_TYPES_KEY, checkout) as string[];
    expect(guards).toHaveLength(1);
    expect(userTypes).toEqual(['customer']);
  });

  it('protects customer cancellation with the same authenticated identity policy', () => {
    const cancel = CarsPublicController.prototype.cancelBooking;
    const guards = Reflect.getMetadata(GUARDS_METADATA, cancel) as unknown[];
    const userTypes = Reflect.getMetadata(USER_TYPES_KEY, cancel) as string[];
    expect(guards).toHaveLength(1);
    expect(userTypes).toEqual(['customer']);
  });
});
