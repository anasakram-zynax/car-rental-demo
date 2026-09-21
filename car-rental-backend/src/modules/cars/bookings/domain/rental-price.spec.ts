import { calculateRentalPrice } from './rental-price.js';

describe('RentalPrice', () => {
  it('should calculate subtotal, tax and total', () => {
    const result = calculateRentalPrice(3, 50);

    expect(result.rentalDays).toBe(3);
    expect(result.dailyPrice).toBe(50);

    expect(result.subtotal).toBe(150);
    expect(result.taxAmount).toBe(15);
    expect(result.totalPrice).toBe(165);
  });
});
