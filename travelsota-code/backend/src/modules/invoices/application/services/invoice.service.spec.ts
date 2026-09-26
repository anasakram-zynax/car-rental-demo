import { Test } from '@nestjs/testing';
import { InvoiceService } from './invoice.service';
import { InvoiceNumberService } from './invoice-number.service';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';

describe('InvoiceService', () => {
  let service: InvoiceService;
  let prisma: jest.Mocked<PrismaService>;
  let invoiceNumberService: jest.Mocked<InvoiceNumberService>;
  let outboxWriter: jest.Mocked<OutboxWriterService>;

  const mockBookingDoc = (overrides: any = {}) => ({
    id: overrides.id ?? 'doc-1',
    bookingId: overrides.bookingId ?? 'booking-1',
    bookingType: overrides.bookingType ?? 'flight',
    documentType: overrides.documentType ?? 'invoice',
    docSubType: overrides.docSubType ?? 'original',
    invoiceNumber: overrides.invoiceNumber ?? 'TVL-INV-2026-000001',
    creditNoteNumber: overrides.creditNoteNumber ?? null,
    userId: overrides.userId ?? 'user-1',
    userType: overrides.userType ?? 'customer',
    paymentId: overrides.paymentId ?? null,
    amount: overrides.amount ?? '970.00',
    currency: overrides.currency ?? 'USD',
    taxAmount: null,
    taxRate: null,
    markupAmount: null,
    commissionAmount: null,
    content: '<html>invoice</html>',
    pdfData: null,
    fileName: 'invoice-TVL-INV-2026-000001.pdf',
    mimeType: 'application/pdf',
    status: overrides.status ?? 'generated',
    emailedTo: null,
    sentAt: null,
    viewedAt: null,
    relatedToId: overrides.relatedToId ?? null,
    generatedById: null,
    metadata: {},
    createdAt: new Date('2026-07-09T12:00:00Z'),
    updatedAt: new Date('2026-07-09T12:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      bookingDocument: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      flightBooking: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      hotelBooking: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      commissionRecord: {
        findFirst: jest.fn(),
      },
      payment: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cbOrQueries: any) => {
        if (typeof cbOrQueries === 'function') {
          return cbOrQueries(prisma);
        }
        return Promise.all(cbOrQueries);
      }),
    } as any;

    invoiceNumberService = {
      nextNumber: jest.fn(),
    } as any;

    outboxWriter = {
      writeInTransaction: jest.fn(),
      write: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceNumberService, useValue: invoiceNumberService },
        { provide: OutboxWriterService, useValue: outboxWriter },
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getById', () => {
    it('returns null when invoice not found', async () => {
      prisma.bookingDocument.findUnique.mockResolvedValue(null);
      const result = await service.getById('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null for void/cancelled invoices', async () => {
      prisma.bookingDocument.findUnique.mockResolvedValue(
        mockBookingDoc({ status: 'void' }),
      );
      const result = await service.getById('doc-1');
      expect(result).toBeNull();
    });

    it('returns mapped document for active invoice', async () => {
      const doc = mockBookingDoc({});
      prisma.bookingDocument.findUnique.mockResolvedValue(doc);
      const result = await service.getById('doc-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('doc-1');
      expect(result!.invoiceNumber).toBe('TVL-INV-2026-000001');
    });
  });

  describe('getStats', () => {
    it('returns all zeros when no invoices exist', async () => {
      prisma.bookingDocument.findMany.mockResolvedValue([]);
      const stats = await service.getStats();
      expect(stats.totalInvoices).toBe(0);
      expect(stats.generatedInvoices).toBe(0);
      expect(stats.sentInvoices).toBe(0);
      expect(stats.viewedInvoices).toBe(0);
      expect(stats.voidInvoices).toBe(0);
      expect(stats.totalAmount).toBe('0.00');
    });

    it('counts invoices by status correctly', async () => {
      prisma.bookingDocument.findMany.mockResolvedValue([
        mockBookingDoc({ status: 'generated', amount: '100.00' }),
        mockBookingDoc({ status: 'generated', amount: '200.00' }),
        mockBookingDoc({ status: 'sent', amount: '150.00' }),
        mockBookingDoc({ status: 'void', amount: '0.00' }),
      ]);
      const stats = await service.getStats();
      expect(stats.totalInvoices).toBe(4);
      expect(stats.generatedInvoices).toBe(2);
      expect(stats.sentInvoices).toBe(1);
      expect(stats.voidInvoices).toBe(1);
    });
  });

  describe('markViewed', () => {
    it('updates viewedAt and status from generated to viewed', async () => {
      prisma.bookingDocument.findUnique.mockResolvedValue(
        mockBookingDoc({ status: 'generated' }),
      );
      prisma.bookingDocument.updateMany.mockResolvedValue({ count: 1 } as any);

      await service.markViewed('doc-1');
      expect(prisma.bookingDocument.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'doc-1' }),
          data: expect.objectContaining({ viewedAt: expect.any(Date), status: 'viewed' }),
        }),
      );
    });

    it('does nothing for void invoices', async () => {
      prisma.bookingDocument.findUnique.mockResolvedValue(
        mockBookingDoc({ status: 'void' }),
      );
      await service.markViewed('doc-1');
      expect(prisma.bookingDocument.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getCreditNotesForInvoice', () => {
    it('returns empty array when no credit notes exist', async () => {
      prisma.bookingDocument.findMany.mockResolvedValue([]);
      const result = await service.getCreditNotesForInvoice('invoice-1');
      expect(result).toEqual([]);
      expect(prisma.bookingDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ relatedToId: 'invoice-1', documentType: 'credit_note' }),
        }),
      );
    });
  });

  describe('voidInvoice', () => {
    it('voids an active invoice', async () => {
      prisma.bookingDocument.findUnique.mockResolvedValue(
        mockBookingDoc({ status: 'generated' }),
      );
      prisma.bookingDocument.update.mockResolvedValue(mockBookingDoc({ status: 'void' }));
      prisma.auditLog.create.mockResolvedValue({} as any);

      await service.voidInvoice('doc-1', 'Duplicate invoice');

      expect(prisma.bookingDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-1' },
          data: { status: 'void' },
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws when trying to void already void invoice', async () => {
      prisma.bookingDocument.findUnique.mockResolvedValue(
        mockBookingDoc({ status: 'void' }),
      );
      await expect(service.voidInvoice('doc-1', 'reason')).rejects.toThrow();
    });
  });

  describe('listForAdmin', () => {
    it('returns paginated results', async () => {
      prisma.bookingDocument.count.mockResolvedValue(3);
      prisma.bookingDocument.findMany.mockResolvedValue([
        mockBookingDoc({ id: 'doc-1' }),
        mockBookingDoc({ id: 'doc-2' }),
        mockBookingDoc({ id: 'doc-3' }),
      ]);

      const result = await service.listForAdmin({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('filters by booking type', async () => {
      prisma.bookingDocument.count.mockResolvedValue(1);
      prisma.bookingDocument.findMany.mockResolvedValue([
        mockBookingDoc({ bookingType: 'hotel' }),
      ]);

      const result = await service.listForAdmin({ bookingType: 'hotel' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].bookingType).toBe('hotel');
    });
  });

  describe('generateForBooking', () => {
    it('returns existing invoice when one already exists', async () => {
      const existing = mockBookingDoc({});
      prisma.bookingDocument.findFirst.mockResolvedValue(existing);

      const result = await service.generateForBooking('booking-1');

      expect(result.id).toBe('doc-1');
      expect(prisma.flightBooking.findUnique).not.toHaveBeenCalled();
    });

    it('throws when booking not found', async () => {
      prisma.bookingDocument.findFirst.mockResolvedValue(null);
      prisma.flightBooking.findUnique.mockResolvedValue(null);
      prisma.hotelBooking.findUnique.mockResolvedValue(null);

      await expect(service.generateForBooking('nonexistent')).rejects.toThrow('Booking nonexistent not found');
    });

    it('creates invoice for a flight booking', async () => {
      prisma.bookingDocument.findFirst
        .mockResolvedValueOnce(null) // outside tx check
        .mockResolvedValueOnce(null); // inside tx check
      prisma.flightBooking.findUnique.mockResolvedValue({
        id: 'booking-1',
        status: 'confirmed',
        amount: 970,
        currency: 'USD',
        userId: 'user-1',
        user: { userType: 'customer' },
        offerSnapshot: { from: 'JFK', to: 'LHR', departureDate: '2026-08-01' },
        travelerSnapshot: [{ firstName: 'John', lastName: 'Doe' }],
        holder: null,
        locatorCode: 'ABC123',
        hotelbedsRef: null,
        supplierReference: null,
        provider: 'travelport',
        createdAt: new Date('2026-07-09T12:00:00Z'),
      });
      invoiceNumberService.nextNumber.mockResolvedValue('TVL-INV-2026-000001');
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Test',
        lastName: 'User',
        agentProfile: null,
      });
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.commissionRecord.findFirst.mockResolvedValue(null);
      prisma.bookingDocument.create.mockResolvedValue(mockBookingDoc({}));

      const result = await service.generateForBooking('booking-1');

      expect(result).not.toBeNull();
      expect(invoiceNumberService.nextNumber).toHaveBeenCalled();
      expect(prisma.bookingDocument.create).toHaveBeenCalled();
      expect(outboxWriter.writeInTransaction).toHaveBeenCalled();
    });
  });

  describe('getByBooking', () => {
    it('returns null when no active document exists', async () => {
      prisma.bookingDocument.findFirst.mockResolvedValue(null);
      const result = await service.getByBooking('booking-1');
      expect(result).toBeNull();
    });

    it('returns active document for booking', async () => {
      prisma.bookingDocument.findFirst.mockResolvedValue(mockBookingDoc({}));
      const result = await service.getByBooking('booking-1');
      expect(result).not.toBeNull();
      expect(result!.bookingId).toBe('booking-1');
    });
  });
});
