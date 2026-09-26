import { Test } from '@nestjs/testing';
import { InvoiceNumberService } from './invoice-number.service';

describe('InvoiceNumberService', () => {
  let service: InvoiceNumberService;

  const mockTx = () => {
    let counter = 0;
    return {
      invoiceSequence: {
        upsert: jest.fn().mockImplementation(() => {
          counter++;
          return Promise.resolve({ lastNumber: counter });
        }),
      },
    };
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [InvoiceNumberService],
    }).compile();

    service = module.get<InvoiceNumberService>(InvoiceNumberService);
  });

  describe('nextNumber', () => {
    it('generates invoice number with correct format', async () => {
      const tx = mockTx();
      const number = await service.nextNumber(tx, {
        documentType: 'invoice',
        legalEntityCode: 'TVL',
        date: new Date('2026-07-09T00:00:00Z'),
      });

      expect(number).toMatch(/^TVL-INV-2026-\d{6}$/);
    });

    it('generates credit note number with CN prefix', async () => {
      const tx = mockTx();
      const number = await service.nextNumber(tx, {
        documentType: 'credit_note',
        legalEntityCode: 'TVL',
        date: new Date('2026-07-09T00:00:00Z'),
      });

      expect(number).toMatch(/^TVL-CN-2026-\d{6}$/);
    });

    it('increments sequence on each call', async () => {
      const tx = mockTx();

      const first = await service.nextNumber(tx, {
        documentType: 'invoice',
        legalEntityCode: 'TVL',
        date: new Date('2026-01-01T00:00:00Z'),
      });
      const second = await service.nextNumber(tx, {
        documentType: 'invoice',
        legalEntityCode: 'TVL',
        date: new Date('2026-01-01T00:00:00Z'),
      });

      const firstNum = parseInt(first.split('-').pop()!, 10);
      const secondNum = parseInt(second.split('-').pop()!, 10);
      expect(secondNum).toBe(firstNum + 1);
    });

    it('uses different prefixes for different document types', async () => {
      const tx = mockTx();

      const inv = await service.nextNumber(tx, {
        documentType: 'invoice',
        date: new Date('2026-01-01T00:00:00Z'),
      });
      const cn = await service.nextNumber(tx, {
        documentType: 'credit_note',
        date: new Date('2026-01-01T00:00:00Z'),
      });

      expect(inv).toContain('-INV-');
      expect(cn).toContain('-CN-');
    });

    it('defaults to IKF entity code when not provided', async () => {
      const tx = mockTx();
      const number = await service.nextNumber(tx, {
        documentType: 'invoice',
        date: new Date('2026-01-01T00:00:00Z'),
      });

      expect(number).toMatch(/^TVL-/);
    });

    it('pads sequence number to 6 digits', async () => {
      const tx = mockTx();
      const number = await service.nextNumber(tx, {
        documentType: 'invoice',
        legalEntityCode: 'TVL',
        date: new Date('2026-01-01T00:00:00Z'),
      });

      const seq = number.split('-').pop()!;
      expect(seq).toHaveLength(6);
      expect(seq).toBe('000001');
    });

    it('uses current year when date not provided', async () => {
      const tx = mockTx();
      const number = await service.nextNumber(tx, {
        documentType: 'invoice',
        legalEntityCode: 'TVL',
      });

      const currentYear = new Date().getUTCFullYear();
      expect(number).toContain(`-${currentYear}-`);
    });
  });
});
