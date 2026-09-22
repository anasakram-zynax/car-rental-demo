const TAX_RATE = 0.1;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RentalEstimate {
  rentalDays: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export function calculateRentalEstimate(
  pickupAt: string,
  returnAt: string,
  dailyPrice: number,
): RentalEstimate | null {
  const pickupTime = new Date(pickupAt).getTime();
  const returnTime = new Date(returnAt).getTime();

  if (!Number.isFinite(pickupTime) || !Number.isFinite(returnTime) || returnTime <= pickupTime) {
    return null;
  }

  const rentalDays = Math.ceil((returnTime - pickupTime) / MILLISECONDS_PER_DAY);
  const subtotal = rentalDays * dailyPrice;
  const taxAmount = subtotal * TAX_RATE;

  return { rentalDays, subtotal, taxAmount, total: subtotal + taxAmount };
}
