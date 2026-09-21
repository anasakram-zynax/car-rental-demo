export interface RentalPrice {
  rentalDays: number;
  dailyPrice: number;
  subtotal: number;
  taxAmount: number;
  totalPrice: number;
}

const TAX_RATE = 0.1;

export function calculateRentalPrice(
  rentalDays: number,
  dailyPrice: number,
): RentalPrice {
  if (rentalDays < 1) {
    throw new Error('Rental days must be at least 1.');
  }

  if (dailyPrice < 0) {
    throw new Error('Daily price cannot be negative.');
  }

  const subtotal = rentalDays * dailyPrice;
  const taxAmount = subtotal * TAX_RATE;
  const totalPrice = subtotal + taxAmount;

  return {
    rentalDays,
    dailyPrice,
    subtotal,
    taxAmount,
    totalPrice,
  };
}
