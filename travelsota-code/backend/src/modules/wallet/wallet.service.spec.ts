import { WalletService } from './wallet.service';

/**
 * Wallet single-currency ledger — conversion boundary tests.
 *
 * The wallet stores ONE balance per agent (AgentProfile.walletCurrency).
 * Every foreign amount must be converted into that currency BEFORE touching
 * the balance; otherwise e.g. an INR fare deducts raw rupees from a USD
 * balance. These tests pin the boundary behavior of toWalletCurrency.
 */
describe('WalletService – currency boundary', () => {
  const buildService = (convertImpl?: jest.Mock) => {
    const currencyService = {
      convert: convertImpl ?? jest.fn(),
      formatWithCode: jest.fn(),
    };
    const service = new WalletService(
      {} as never,
      {} as never,
      { log: jest.fn() } as never,
      currencyService as never,
    );
    return { service, currencyService };
  };

  it('same currency is identity and never calls convert', async () => {
    const { service, currencyService } = buildService();
    const res = await service.toWalletCurrency(100, 'usd', 'USD');
    expect(res).toEqual({ amount: 100, currency: 'USD', converted: false });
    expect(currencyService.convert).not.toHaveBeenCalled();
  });

  it('missing amount currency defaults to the wallet currency', async () => {
    const { service, currencyService } = buildService();
    const res = await service.toWalletCurrency(50, undefined, 'USD');
    expect(res).toEqual({ amount: 50, currency: 'USD', converted: false });
    expect(currencyService.convert).not.toHaveBeenCalled();
  });

  it('foreign currency converts through CurrencyService', async () => {
    const convert = jest.fn().mockResolvedValue({ amount: 12, currency: 'USD' });
    const { service } = buildService(convert);
    const res = await service.toWalletCurrency(1000, 'INR', 'USD');
    expect(convert).toHaveBeenCalledWith(1000, 'INR', 'USD');
    expect(res).toEqual({ amount: 12, currency: 'USD', converted: true });
  });

  it('getProfileCurrency falls back to USD for legacy rows', async () => {
    const { service } = buildService();
    (service as any).prisma = {
      agentProfile: { findUnique: jest.fn().mockResolvedValue({ walletCurrency: null }) },
    };
    await expect(service.getProfileCurrency('p1')).resolves.toBe('USD');
  });
});
