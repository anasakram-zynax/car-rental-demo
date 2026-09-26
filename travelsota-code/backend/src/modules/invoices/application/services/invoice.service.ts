import { Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { InvoiceNumberService } from './invoice-number.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import type {
  GeneratedInvoiceDocument,
  InvoiceStats,
  InvoiceListItem,
  PaginatedInvoiceList,
} from '../../domain/invoice-document.types';

interface BookingInvoiceData {
  id: string;
  bookingType: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  userId: string | null;
  userType: string | null;
  offerSnapshot: any;
  travelerSnapshot: any;
  holder: any;
  locatorCode: string | null;
  hotelbedsRef: string | null;
  supplierReference: string | null;
  provider: string;
  createdAt: Date;
}

/**
 * Seller / issuer identity printed on every invoice & credit note.
 * TravelsOTA is always the issuer (B2C and B2B); the customer/agent is the "Bill To".
 * TODO: move to app-config / env when a company-settings module exists.
 */
const TRAVELSOTA_ISSUER = {
  legalName: 'TravelsOTA Travel LLC',
  brandName: 'TravelsOTA',
  tagline: 'Flights & Hotels · Worldwide',
  addressLines: [
    'Business Bay, Tower One, Office 1204',
    'Dubai, United Arab Emirates',
  ],
  email: 'billing@travelsota.com',
  phone: '+971 4 000 0000',
  website: 'www.travelsota.com',
  taxId: 'TRN 100 0000 0000 0003',
  accreditation: 'IATA Accredited · Seller of Travel',
} as const;

/** Brand palette shared by the HTML template and the PDF renderer. */
const BRAND = {
  primary: '#033d4a',
  primaryDark: '#012830',
  accent: '#c9a227',
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  bg: '#eef2f5',
  success: '#047857',
  danger: '#b91c1c',
} as const;

interface InvoiceTemplateData {
  agentName: string;
  agentCompany: string;
  agentAddress: string;
  agentTaxId: string;
  bookingRef: string;
  bookingType: string;
  bookingDate: string;
  amount: string;
  currency: string;
  status: string;
  passengerName?: string;
  route?: string;
  departureDate?: string;
  provider: string;
  invoiceNumber: string;
  lineItems: Array<{ description: string; amount: string }>;
  total: string;
  commissionAmount?: string;
  commissionRate?: string;
}

interface InvoiceListFilters {
  page?: number;
  limit?: number;
  q?: string;
  userId?: string;
  bookingType?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  documentType?: 'invoice' | 'credit_note' | 'receipt';
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceNumberService: InvoiceNumberService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly currencyService: CurrencyService,
  ) {}

  async generateForBooking(
    bookingId: string,
  ): Promise<GeneratedInvoiceDocument> {
    const existing = await this.getByBooking(bookingId, 'invoice');
    if (existing) return existing;

    const booking = await this.getBookingData(bookingId);
    if (!booking) {
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found`,
      );
    }

    // Read all data needed for the document OUTSIDE the transaction.
    // PDF generation and HTML rendering are expensive — keeping them inside
    // a Prisma transaction holds the DB connection for too long, causing
    // "Unable to start a transaction in the given time" under load.
    const payment = await this.findLatestSuccessfulPaymentNoTx(booking);
    const commission = await this.findCommissionNoTx(booking.id);
    const agentInfo = await this.loadAgentInfo(booking.userId);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existingInTx = await tx.bookingDocument.findFirst({
            where: {
              bookingId,
              documentType: 'invoice',
              OR: [{ docSubType: null }, { docSubType: 'original' }],
              status: { notIn: ['cancelled', 'void'] },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (existingInTx) return this.mapDocument(existingInTx);

          const invoiceNumber = await this.invoiceNumberService.nextNumber(tx, {
            documentType: 'invoice',
            legalEntityCode: this.resolveLegalEntityCode(booking),
          });

          // Heavy content generation happens outside the tx — we only keep
          // fast DB writes (create + outbox) inside.
          const templateData = await this.buildTemplateData(
            booking,
            invoiceNumber,
            agentInfo,
            commission,
          );
          const htmlContent = this.renderInvoiceHtml(templateData);
          const pdfBuffer = await this.generatePdf(templateData);

          const doc = await tx.bookingDocument.create({
            data: {
              bookingId,
              bookingType: booking.bookingType,
              documentType: 'invoice',
              docSubType: 'original',
              invoiceNumber,
              userId: booking.userId,
              userType: booking.userType,
              paymentId: payment?.id ?? null,
              amount: booking.amount != null ? String(booking.amount) : null,
              currency: booking.currency,
              commissionAmount:
                commission?.commissionAmount != null
                  ? String(commission.commissionAmount)
                  : null,
              content: htmlContent,
              pdfData: pdfBuffer as unknown as Uint8Array<ArrayBuffer>,
              fileName: `invoice-${invoiceNumber}.pdf`,
              mimeType: 'application/pdf',
              status: 'generated',
              metadata: {
                provider: booking.provider,
                bookingRef: templateData.bookingRef,
                paymentReference: payment?.reference ?? null,
                paymentStatus: payment?.status ?? null,
                generatedBy: 'system',
                legacyBookingAmountSource: 'booking.amount',
              },
            },
          });

          await this.outboxWriter.writeInTransaction(tx, {
            eventType: 'INVOICE_GENERATED',
            aggregateType: 'BookingDocument',
            aggregateId: doc.id,
            idempotencyKey: `invoice-generated:${doc.id}`,
            payload: {
              documentId: doc.id,
              bookingId,
              bookingType: booking.bookingType,
              invoiceNumber,
              userId: booking.userId,
            },
          });

          this.logger.log(
            `Invoice ${invoiceNumber} generated for booking ${bookingId}`,
          );
          return this.mapDocument(doc);
        },
        { timeout: 15000, maxWait: 10000 },
      );
    } catch (error: any) {
      if (this.isUniqueConflict(error)) {
        const raced = await this.getByBooking(bookingId, 'invoice');
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async findLatestSuccessfulPaymentNoTx(
    booking: BookingInvoiceData,
  ) {
    return this.prisma.payment.findFirst({
      where: {
        bookingId: booking.id,
        bookingType: {
          in: [booking.bookingType, booking.bookingType.toUpperCase()],
        },
        status: 'PAID',
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, reference: true, status: true },
    });
  }

  private async findCommissionNoTx(bookingId: string) {
    return this.prisma.commissionRecord.findFirst({
      where: { bookingId },
      select: { commissionAmount: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async loadAgentInfo(userId: string | null): Promise<{
    agentName: string;
    agentCompany: string;
    agentAddress: string;
    agentTaxId: string;
  } | null> {
    if (!userId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        agentProfile: {
          select: { companyName: true, companyAddress: true, taxId: true },
        },
      },
    });
    if (!user) return null;
    return {
      agentName: [user.firstName, user.lastName].filter(Boolean).join(' '),
      agentCompany: user.agentProfile?.companyName ?? '',
      agentAddress: user.agentProfile?.companyAddress ?? '',
      agentTaxId: user.agentProfile?.taxId ?? '',
    };
  }

  private async buildTemplateData(
    booking: BookingInvoiceData,
    invoiceNumber: string,
    agentInfo: {
      agentName: string;
      agentCompany: string;
      agentAddress: string;
      agentTaxId: string;
    } | null,
    commissionRecord: { commissionAmount: unknown } | null,
  ): Promise<InvoiceTemplateData> {
    let passengerName = '';
    let route = '';

    if (booking.bookingType === 'flight') {
      passengerName = booking.travelerSnapshot?.[0]
        ? `${booking.travelerSnapshot[0].firstName ?? ''} ${booking.travelerSnapshot[0].lastName ?? ''}`.trim()
        : '';
      route = `${booking.offerSnapshot?.from ?? ''} -> ${booking.offerSnapshot?.to ?? ''}`;
    } else {
      passengerName = booking.holder?.name ?? '';
      route = booking.offerSnapshot?.name ?? '';
    }

    const amount = Number(booking.amount ?? 0);
    const bookingCurrency = booking.currency ?? 'USD';
    const formattedAmount = await this.currencyService.formatWithCode(amount, bookingCurrency);
    // `amount` is the TOTAL the customer was charged (supplier fare + markup
    // + taxes). Do not label it "Base …" — on flight bookings that label used
    // to print the net supplier fare, understating the tax invoice. Keep the
    // line customer-safe: no supplier-cost/markup split here.
    const lineLabel =
      booking.bookingType === 'flight'
        ? 'Flight booking (incl. taxes & fees)'
        : 'Hotel booking (incl. taxes & fees)';
    const lineItems = [
      {
        description: lineLabel,
        amount: formattedAmount,
      },
    ];

    let commissionAmount: string | undefined;
    let commissionRate: string | undefined;

    if (commissionRecord) {
      commissionAmount = await this.currencyService.formatWithCode(
        Number(commissionRecord.commissionAmount),
        bookingCurrency,
      );
    }

    return {
      commissionAmount,
      commissionRate,
      agentName: agentInfo?.agentName ?? '',
      agentCompany: agentInfo?.agentCompany ?? '',
      agentAddress: agentInfo?.agentAddress ?? '',
      agentTaxId: agentInfo?.agentTaxId ?? '',
      bookingRef:
        booking.locatorCode ??
        booking.supplierReference ??
        booking.hotelbedsRef ??
        booking.id.substring(0, 8),
      bookingType: booking.bookingType,
      bookingDate: booking.createdAt.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      amount: formattedAmount,
      currency: bookingCurrency,
      status: booking.status,
      passengerName,
      route,
      departureDate: booking.offerSnapshot?.departureDate
        ? new Date(booking.offerSnapshot.departureDate).toLocaleDateString()
        : '',
      provider: booking.provider,
      invoiceNumber,
      lineItems,
      total: formattedAmount,
    };
  }

  async getByBooking(
    bookingId: string,
    documentType: 'invoice' | 'credit_note' | 'receipt' = 'invoice',
  ): Promise<GeneratedInvoiceDocument | null> {
    const doc = await this.prisma.bookingDocument.findFirst({
      where: {
        bookingId,
        documentType,
        status: { notIn: ['cancelled', 'void'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return doc ? this.mapDocument(doc) : null;
  }

  async getById(id: string): Promise<GeneratedInvoiceDocument | null> {
    const doc = await this.prisma.bookingDocument.findUnique({
      where: { id },
    });

    if (!doc || doc.status === 'void' || doc.status === 'cancelled')
      return null;
    return this.mapDocument(doc);
  }

  async getByIdForUser(
    id: string,
    userId: string,
    userType?: string,
  ): Promise<GeneratedInvoiceDocument | null> {
    const doc = await this.prisma.bookingDocument.findUnique({
      where: { id },
    });

    if (!doc || doc.status === 'void' || doc.status === 'cancelled')
      return null;
    if (userType === 'STAFF') return this.mapDocument(doc);
    if (doc.userId === userId) return this.mapDocument(doc);

    const ownsBooking = await this.isBookingOwnedByUser(doc.bookingId, userId);
    return ownsBooking ? this.mapDocument(doc) : null;
  }

  async listByUser(userId: string, limit = 50): Promise<InvoiceListItem[]> {
    const docs = await this.prisma.bookingDocument.findMany({
      where: {
        userId,
        documentType: 'invoice',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return docs.map((doc) => this.mapListItem(doc));
  }

  async listForUser(
    userId: string,
    filters: InvoiceListFilters = {},
  ): Promise<PaginatedInvoiceList> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const ownedBookingIds = await this.findBookingIdsForUser(userId);

    const where: any = {
      documentType: filters.documentType ?? 'invoice',
      status: filters.status ?? { notIn: ['cancelled', 'void'] },
      AND: [
        {
          OR: [
            { userId },
            ...(ownedBookingIds.length > 0
              ? [{ bookingId: { in: ownedBookingIds } }]
              : []),
          ],
        },
      ],
    };

    this.applyListFilters(where, filters);

    const [total, docs] = await this.prisma.$transaction([
      this.prisma.bookingDocument.count({ where }),
      this.prisma.bookingDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: docs.map((doc) => this.mapListItem(doc)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listForAdmin(
    filters: InvoiceListFilters = {},
  ): Promise<PaginatedInvoiceList> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const where: any = {
      documentType: filters.documentType ?? 'invoice',
    };

    this.applyListFilters(where, filters);

    // ponytail: read ops don't need $transaction — slow count hits 5s timeout.
    const [total, docs] = await Promise.all([
      this.prisma.bookingDocument.count({ where }),
      this.prisma.bookingDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: docs.map((doc) => this.mapListItem(doc)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats(): Promise<InvoiceStats> {
    // DB-side aggregation — the previous version fetched every invoice row
    // and counted/summed in JS (O(total) per dashboard open).
    const [byStatus, byCurrency] = await Promise.all([
      this.prisma.bookingDocument.groupBy({
        by: ['status'],
        where: { documentType: 'invoice' },
        _count: { id: true },
      }),
      this.prisma.bookingDocument.groupBy({
        by: ['currency'],
        where: { documentType: 'invoice' },
        _sum: { amount: true },
      }),
    ]);

    const countOf = (status: string): number =>
      byStatus.find((r) => r.status === status)?._count.id ?? 0;

    const currencies: Record<string, number> = {};

    for (const row of byCurrency) {
      const currency = row.currency ?? 'USD';
      const amount = Number(row._sum.amount ?? 0);
      currencies[currency] = (currencies[currency] ?? 0) + amount;
    }

    return {
      totalInvoices: byStatus.reduce((s, r) => s + r._count.id, 0),
      generatedInvoices: countOf('generated'),
      emailPendingInvoices: countOf('email_pending'),
      sentInvoices: countOf('sent'),
      viewedInvoices: countOf('viewed'),
      voidInvoices: countOf('void'),
      currencies: Object.fromEntries(
        await Promise.all(
          Object.entries(currencies).map(async ([currency, amount]) => [
            currency,
            await this.currencyService.formatAmount(amount, currency),
          ]),
        ),
      ),
    };
  }

  async markViewed(id: string): Promise<void> {
    const doc = await this.prisma.bookingDocument.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!doc || doc.status === 'cancelled' || doc.status === 'void') return;

    await this.prisma.bookingDocument.updateMany({
      where: {
        id,
        viewedAt: null,
        status: { notIn: ['cancelled', 'void'] },
      },
      data: {
        viewedAt: new Date(),
        ...(doc.status === 'generated' ? { status: 'viewed' } : {}),
      },
    });
  }

  async getAgentInvoices(agentUserId: string): Promise<InvoiceListItem[]> {
    const docs = await this.prisma.bookingDocument.findMany({
      where: {
        userId: agentUserId,
        documentType: 'invoice',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (docs.length > 0) return docs.map((doc) => this.mapListItem(doc));

    // Compatibility fallback for legacy rows generated before userId snapshots.
    const [flightIds, hotelIds] = await Promise.all([
      this.prisma.flightBooking.findMany({
        where: { userId: agentUserId },
        select: { id: true },
      }),
      this.prisma.hotelBooking.findMany({
        where: { userId: agentUserId },
        select: { id: true },
      }),
    ]);

    const allBookingIds = [
      ...flightIds.map((f) => f.id),
      ...hotelIds.map((h) => h.id),
    ];
    if (allBookingIds.length === 0) return [];

    const legacyDocs = await this.prisma.bookingDocument.findMany({
      where: {
        bookingId: { in: allBookingIds },
        documentType: 'invoice',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return legacyDocs.map((doc) => this.mapListItem(doc));
  }

  private applyListFilters(where: any, filters: InvoiceListFilters): void {
    if (filters.userId) where.userId = filters.userId;
    if (filters.bookingType) where.bookingType = filters.bookingType;
    if (filters.status) where.status = filters.status;
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {
        ...(filters.fromDate ? { gte: new Date(filters.fromDate) } : {}),
        ...(filters.toDate ? { lte: new Date(filters.toDate) } : {}),
      };
    }
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { invoiceNumber: { contains: q, mode: 'insensitive' } },
            { creditNoteNumber: { contains: q, mode: 'insensitive' } },
            { bookingId: { contains: q, mode: 'insensitive' } },
            { fileName: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }
  }

  private async findBookingIdsForUser(userId: string): Promise<string[]> {
    const [flights, hotels] = await Promise.all([
      this.prisma.flightBooking.findMany({
        where: { userId },
        select: { id: true },
      }),
      this.prisma.hotelBooking.findMany({
        where: { userId },
        select: { id: true },
      }),
    ]);

    return [
      ...flights.map((flight) => flight.id),
      ...hotels.map((hotel) => hotel.id),
    ];
  }

  private async isBookingOwnedByUser(
    bookingId: string,
    userId: string,
  ): Promise<boolean> {
    const [flight, hotel] = await Promise.all([
      this.prisma.flightBooking.findUnique({
        where: { id: bookingId },
        select: { userId: true },
      }),
      this.prisma.hotelBooking.findUnique({
        where: { id: bookingId },
        select: { userId: true },
      }),
    ]);

    return flight?.userId === userId || hotel?.userId === userId;
  }

  private async getBookingData(
    bookingId: string,
  ): Promise<BookingInvoiceData | null> {
    const flight = await this.prisma.flightBooking.findUnique({
      where: { id: bookingId },
      include: { user: true },
    });
    if (flight) {
      return {
        id: flight.id,
        bookingType: 'flight',
        status: flight.status,
        amount: flight.amount,
        currency: flight.currency,
        userId: flight.userId,
        userType: flight.user?.userType ?? null,
        offerSnapshot: flight.offerSnapshot,
        travelerSnapshot: flight.travelerSnapshot,
        holder: null,
        locatorCode: flight.locatorCode,
        hotelbedsRef: null,
        supplierReference: null,
        provider: flight.provider,
        createdAt: flight.createdAt,
      };
    }

    const hotel = await this.prisma.hotelBooking.findUnique({
      where: { id: bookingId },
      include: { user: true },
    });
    if (hotel) {
      return {
        id: hotel.id,
        bookingType: 'hotel',
        status: hotel.status,
        amount: hotel.amount,
        currency: hotel.currency,
        userId: hotel.userId,
        userType: hotel.user?.userType ?? null,
        offerSnapshot: hotel.hotelSnapshot,
        travelerSnapshot: null,
        holder: hotel.holder,
        locatorCode: null,
        hotelbedsRef: hotel.hotelbedsRef,
        supplierReference: hotel.supplierReference,
        provider: hotel.provider,
        createdAt: hotel.createdAt,
      };
    }

    return null;
  }

  private resolveLegalEntityCode(_booking: BookingInvoiceData): string {
    return 'TVL';
  }

  private renderInvoiceHtml(data: InvoiceTemplateData): string {
    const esc = (v: string) => this.escapeHtml(v);
    const isCreditNote = data.status === 'credit_note';
    const docLabel = isCreditNote ? 'Credit Note' : 'Tax Invoice';
    const numberLabel = isCreditNote ? 'Credit Note No.' : 'Invoice No.';
    const isFlight = data.bookingType === 'flight';
    const typeLabel =
      data.bookingType.charAt(0).toUpperCase() + data.bookingType.slice(1);
    const generatedOn = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const payBadge = isCreditNote
      ? `<span class="badge badge-credit">Refund / Credit</span>`
      : `<span class="badge badge-paid">Paid</span>`;

    const lineItemRows = data.lineItems
      .map(
        (item, idx) => `
        <tr>
          <td class="col-idx">${idx + 1}</td>
          <td class="col-desc">${esc(item.description)}</td>
          <td class="col-amt">${esc(item.amount)}</td>
        </tr>`,
      )
      .join('');

    const tripRows: string[] = [];
    if (data.route)
      tripRows.push(
        this.tripRow(isFlight ? 'Route' : 'Property', esc(data.route)),
      );
    if (data.passengerName)
      tripRows.push(
        this.tripRow(isFlight ? 'Traveller' : 'Guest', esc(data.passengerName)),
      );
    if (data.departureDate)
      tripRows.push(
        this.tripRow(
          isFlight ? 'Departure' : 'Check-in',
          esc(data.departureDate),
        ),
      );
    tripRows.push(this.tripRow('Booking Ref', esc(data.bookingRef)));
    tripRows.push(this.tripRow('Product', typeLabel));
    tripRows.push(
      this.tripRow('Supplier', esc((data.provider || '').toUpperCase())),
    );

    const billToLines = [
      data.agentName && `<p class="name">${esc(data.agentName)}</p>`,
      data.agentCompany && `<p>${esc(data.agentCompany)}</p>`,
      data.agentAddress && `<p>${esc(data.agentAddress)}</p>`,
      data.agentTaxId && `<p class="muted">Tax ID: ${esc(data.agentTaxId)}</p>`,
    ].filter(Boolean);
    if (billToLines.length === 0)
      billToLines.push('<p class="name">Customer</p>');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(docLabel)} ${esc(data.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 0; }
    :root {
      --primary: ${BRAND.primary}; --primary-dark: ${BRAND.primaryDark}; --accent: ${BRAND.accent};
      --ink: ${BRAND.ink}; --muted: ${BRAND.muted}; --line: ${BRAND.line}; --bg: ${BRAND.bg};
      --success: ${BRAND.success}; --danger: ${BRAND.danger};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: var(--ink); background: var(--bg); font-size: 13px; line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    .sheet {
      max-width: 820px; margin: 24px auto; background: #fff;
      box-shadow: 0 10px 40px rgba(3,61,74,.12); border-radius: 14px; overflow: hidden;
    }
    /* Header */
    .header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: #fff; padding: 32px 40px; display: flex; justify-content: space-between; align-items: flex-start;
      position: relative;
    }
    .header::after {
      content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 4px;
      background: linear-gradient(90deg, var(--accent) 0%, rgba(201,162,39,.2) 100%);
    }
    .brand-name { font-size: 26px; font-weight: 700; letter-spacing: -.5px; }
    .brand-name span { color: var(--accent); }
    .brand-tag { font-size: 11px; opacity: .8; margin-top: 2px; letter-spacing: .3px; }
    .brand-meta { font-size: 10.5px; opacity: .75; margin-top: 14px; line-height: 1.7; }
    .doc-box { text-align: right; }
    .doc-label { font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .doc-number { font-size: 12px; opacity: .85; margin-top: 4px; }
    .doc-date { font-size: 11px; opacity: .7; margin-top: 2px; }
    .badge {
      display: inline-block; margin-top: 12px; padding: 5px 14px; border-radius: 999px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px;
    }
    .badge-paid { background: rgba(4,120,87,.18); color: #6ee7b7; border: 1px solid rgba(110,231,183,.5); }
    .badge-credit { background: rgba(201,162,39,.2); color: #fcd34d; border: 1px solid rgba(252,211,77,.5); }
    /* Parties */
    .parties { display: flex; gap: 28px; padding: 30px 40px 8px; }
    .parties > div { flex: 1; }
    .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 8px; }
    .party p { font-size: 12.5px; }
    .party .name { font-weight: 600; color: var(--ink); }
    .party .muted { color: var(--muted); font-size: 11.5px; }
    /* Trip summary */
    .trip { margin: 20px 40px 4px; background: #f8fafc; border: 1px solid var(--line); border-radius: 10px; padding: 6px 20px; }
    .trip-grid { display: flex; flex-wrap: wrap; }
    .trip-cell { width: 50%; display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eef2f6; }
    .trip-cell:nth-child(odd) { padding-right: 20px; }
    .trip-cell:nth-child(even) { padding-left: 20px; }
    .trip-k { color: var(--muted); font-size: 11.5px; }
    .trip-v { font-weight: 600; font-size: 12px; text-align: right; }
    /* Items */
    .items { width: calc(100% - 80px); margin: 24px 40px 0; border-collapse: collapse; }
    .items thead th {
      background: var(--primary); color: #fff; padding: 11px 14px; font-size: 10.5px;
      text-transform: uppercase; letter-spacing: .6px; text-align: left;
    }
    .items thead th:last-child { text-align: right; }
    .items thead th:first-child { border-top-left-radius: 8px; }
    .items thead th:last-child { border-top-right-radius: 8px; }
    .items tbody td { padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 12.5px; }
    .items tbody tr:nth-child(even) { background: #f8fafc; }
    .col-idx { width: 36px; color: var(--muted); }
    .col-amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    /* Totals */
    .totals { display: flex; justify-content: flex-end; padding: 16px 40px 4px; }
    .totals-box { width: 300px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12.5px; }
    .totals-row .lbl { color: var(--muted); }
    .totals-row.commission .val { color: var(--success); }
    .grand {
      display: flex; justify-content: space-between; align-items: center; margin-top: 8px;
      padding: 12px 16px; background: var(--primary); color: #fff; border-radius: 10px;
    }
    .grand .lbl { font-size: 12px; text-transform: uppercase; letter-spacing: .8px; opacity: .85; }
    .grand .val { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
    /* Notes */
    .notes { margin: 26px 40px 0; padding: 16px 18px; background: #f8fafc; border-left: 3px solid var(--accent); border-radius: 6px; }
    .notes h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .8px; color: var(--primary); margin-bottom: 6px; }
    .notes p { font-size: 11px; color: var(--muted); margin-bottom: 3px; }
    /* Footer */
    .footer { margin-top: 26px; padding: 18px 40px 30px; border-top: 1px solid var(--line); text-align: center; color: var(--muted); font-size: 10.5px; }
    .footer .thanks { color: var(--primary); font-weight: 600; font-size: 12px; margin-bottom: 4px; }
    .footer .accred { margin-top: 6px; font-size: 9.5px; opacity: .8; }
    @media print { body { background: #fff; } .sheet { box-shadow: none; margin: 0; border-radius: 0; max-width: 100%; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand-name">iK<span>ftech</span></div>
        <div class="brand-tag">${esc(TRAVELSOTA_ISSUER.tagline)}</div>
        <div class="brand-meta">
          ${TRAVELSOTA_ISSUER.addressLines.map((l) => esc(l)).join('<br>')}<br>
          ${esc(TRAVELSOTA_ISSUER.email)} · ${esc(TRAVELSOTA_ISSUER.phone)}<br>
          ${esc(TRAVELSOTA_ISSUER.taxId)}
        </div>
      </div>
      <div class="doc-box">
        <div class="doc-label">${esc(docLabel)}</div>
        <div class="doc-number">${esc(numberLabel)} ${esc(data.invoiceNumber)}</div>
        <div class="doc-date">Issued ${esc(generatedOn)}</div>
        ${payBadge}
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Billed To</div>
        ${billToLines.join('\n        ')}
      </div>
      <div class="party">
        <div class="party-label">Booking Details</div>
        <p><span class="muted">Date:</span> ${esc(data.bookingDate)}</p>
        <p><span class="muted">Reference:</span> ${esc(data.bookingRef)}</p>
        <p><span class="muted">Product:</span> ${typeLabel}</p>
      </div>
    </div>

    <div class="trip">
      <div class="trip-grid">
        ${tripRows.join('\n        ')}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr><th class="col-idx">#</th><th>Description</th><th>Amount</th></tr>
      </thead>
      <tbody>${lineItemRows}</tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="totals-row"><span class="lbl">Subtotal</span><span class="val">${esc(data.total)}</span></div>
        ${data.commissionAmount ? `<div class="totals-row commission"><span class="lbl">Commission (${esc(data.commissionRate ?? '')})</span><span class="val">${esc(data.commissionAmount)}</span></div>` : ''}
        <div class="grand"><span class="lbl">${isCreditNote ? 'Total Credited' : 'Total Paid'}</span><span class="val">${esc(data.total)}</span></div>
      </div>
    </div>

    <div class="notes">
      <h4>Notes &amp; Terms</h4>
      <p>${isCreditNote ? 'This credit note reflects a refund processed against the referenced invoice.' : 'Payment received in full. This is a system-generated tax invoice and is valid without signature.'}</p>
      <p>Fares, taxes and supplier fees are non-refundable except as permitted by the airline / hotel fare rules. Cancellation and change penalties may apply per supplier terms.</p>
      <p>For assistance with this booking, contact ${esc(TRAVELSOTA_ISSUER.email)} quoting reference ${esc(data.bookingRef)}.</p>
    </div>

    <div class="footer">
      <div class="thanks">Thank you for booking with ${esc(TRAVELSOTA_ISSUER.brandName)}.</div>
      <div>${esc(TRAVELSOTA_ISSUER.legalName)} · ${esc(TRAVELSOTA_ISSUER.website)}</div>
      <div class="accred">${esc(TRAVELSOTA_ISSUER.accreditation)}</div>
    </div>
  </div>
</body>
</html>`;
  }

  private tripRow(key: string, value: string): string {
    return `<div class="trip-cell"><span class="trip-k">${this.escapeHtml(key)}</span><span class="trip-v">${value}</span></div>`;
  }

  /**
   * Renders a premium, branded PDF invoice/credit note directly with PDFKit
   * (no HTML rendering engine required). Layout mirrors renderInvoiceHtml.
   */
  private async generatePdf(data: InvoiceTemplateData): Promise<Buffer> {
    const PDFDocument = await this.loadPdfKit();
    if (!PDFDocument) {
      this.logger.warn(
        'PDFKit not available - returning HTML content as fallback',
      );
      return Buffer.from(this.renderInvoiceHtml(data));
    }

    const isCreditNote = data.status === 'credit_note';
    const docLabel = isCreditNote ? 'CREDIT NOTE' : 'TAX INVOICE';
    const isFlight = data.bookingType === 'flight';
    const typeLabel =
      data.bookingType.charAt(0).toUpperCase() + data.bookingType.slice(1);
    const generatedOn = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 0,
          info: {
            Title: `${docLabel} ${data.invoiceNumber}`,
            Author: TRAVELSOTA_ISSUER.legalName,
            Creator: 'TravelsOTA Invoice Service',
            Producer: 'PDFKit',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageW = doc.page.width;
        const M = 48;
        const contentW = pageW - M * 2;

        // ── Header band ───────────────────────────────────────
        const headerH = 132;
        doc.rect(0, 0, pageW, headerH).fill(BRAND.primary);
        doc.rect(0, headerH - 4, pageW, 4).fill(BRAND.accent);

        doc
          .fillColor('#ffffff')
          .font('Helvetica-Bold')
          .fontSize(24)
          .text('TravelsOTA', M, 34);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#cfe0e4')
          .text(TRAVELSOTA_ISSUER.tagline, M, 64);
        doc
          .fontSize(8.5)
          .fillColor('#a9c4ca')
          .text(
            [
              ...TRAVELSOTA_ISSUER.addressLines,
              `${TRAVELSOTA_ISSUER.email}  ·  ${TRAVELSOTA_ISSUER.phone}`,
              TRAVELSOTA_ISSUER.taxId,
            ].join('\n'),
            M,
            82,
            { lineGap: 1.5 },
          );

        // Header right — document meta
        const rightX = pageW - M - 220;
        doc
          .font('Helvetica-Bold')
          .fontSize(18)
          .fillColor('#ffffff')
          .text(docLabel, rightX, 36, { width: 220, align: 'right' });
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#cfe0e4')
          .text(data.invoiceNumber, rightX, 62, { width: 220, align: 'right' });
        doc
          .fontSize(8.5)
          .fillColor('#a9c4ca')
          .text(`Issued ${generatedOn}`, rightX, 76, {
            width: 220,
            align: 'right',
          });

        // Paid / credit pill
        const pillText = isCreditNote ? 'REFUND / CREDIT' : 'PAID';
        const pillColor = isCreditNote ? BRAND.accent : '#34d399';
        doc.font('Helvetica-Bold').fontSize(9);
        const pillW = doc.widthOfString(pillText) + 22;
        const pillX = pageW - M - pillW;
        doc.roundedRect(pillX, 98, pillW, 20, 10).fill(pillColor);
        doc
          .fillColor(BRAND.primaryDark)
          .text(pillText, pillX, 103, { width: pillW, align: 'center' });

        let y = headerH + 28;

        // ── Parties ───────────────────────────────────────────
        const colW = (contentW - 28) / 2;
        const label = (t: string, x: number, yy: number) =>
          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor(BRAND.muted)
            .text(t.toUpperCase(), x, yy, { characterSpacing: 0.5 });

        label('Billed To', M, y);
        const billLines: Array<[string, boolean]> = [];
        if (data.agentName) billLines.push([data.agentName, true]);
        if (data.agentCompany) billLines.push([data.agentCompany, false]);
        if (data.agentAddress) billLines.push([data.agentAddress, false]);
        if (data.agentTaxId)
          billLines.push([`Tax ID: ${data.agentTaxId}`, false]);
        if (billLines.length === 0) billLines.push(['Customer', true]);
        let by = y + 14;
        for (const [line, bold] of billLines) {
          doc
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(10)
            .fillColor(bold ? BRAND.ink : BRAND.muted)
            .text(line, M, by, { width: colW });
          by += 14;
        }

        const col2X = M + colW + 28;
        label('Booking Details', col2X, y);
        let dy = y + 14;
        const detailRow = (k: string, v: string) => {
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor(BRAND.muted)
            .text(`${k}  `, col2X, dy, { continued: true })
            .fillColor(BRAND.ink)
            .text(v);
          dy += 14;
        };
        detailRow('Date:', data.bookingDate);
        detailRow('Reference:', data.bookingRef);
        detailRow('Product:', typeLabel);

        y = Math.max(by, dy) + 14;

        // ── Trip summary box ──────────────────────────────────
        const trip: Array<[string, string]> = [];
        if (data.route)
          trip.push([isFlight ? 'Route' : 'Property', data.route]);
        if (data.passengerName)
          trip.push([isFlight ? 'Traveller' : 'Guest', data.passengerName]);
        if (data.departureDate)
          trip.push([isFlight ? 'Departure' : 'Check-in', data.departureDate]);
        trip.push(['Booking Ref', data.bookingRef]);
        trip.push(['Product', typeLabel]);
        trip.push(['Supplier', (data.provider || '').toUpperCase()]);

        const rows = Math.ceil(trip.length / 2);
        const tripH = rows * 20 + 16;
        doc
          .roundedRect(M, y, contentW, tripH, 8)
          .fillAndStroke('#f8fafc', BRAND.line);
        const cellW = contentW / 2;
        trip.forEach(([k, v], i) => {
          const rx = M + (i % 2) * cellW + 14;
          const ry = y + 12 + Math.floor(i / 2) * 20;
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(BRAND.muted)
            .text(k, rx, ry, { width: cellW - 28 });
          doc
            .font('Helvetica-Bold')
            .fontSize(9.5)
            .fillColor(BRAND.ink)
            .text(v, rx, ry, { width: cellW - 28, align: 'right' });
        });
        y += tripH + 24;

        // ── Items table ───────────────────────────────────────
        const idxW = 32;
        const amtW = 120;
        const descW = contentW - idxW - amtW;
        doc.rect(M, y, contentW, 26).fill(BRAND.primary);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
        doc.text('#', M + 10, y + 8);
        doc.text('DESCRIPTION', M + idxW, y + 8);
        doc.text('AMOUNT', M + idxW + descW, y + 8, {
          width: amtW - 12,
          align: 'right',
        });
        y += 26;

        data.lineItems.forEach((item, idx) => {
          const rowH = 28;
          if (idx % 2 === 1) doc.rect(M, y, contentW, rowH).fill('#f8fafc');
          doc
            .font('Helvetica')
            .fontSize(9.5)
            .fillColor(BRAND.muted)
            .text(String(idx + 1), M + 10, y + 9);
          doc
            .fillColor(BRAND.ink)
            .text(item.description, M + idxW, y + 9, { width: descW - 10 });
          doc
            .font('Helvetica-Bold')
            .fillColor(BRAND.ink)
            .text(item.amount, M + idxW + descW, y + 9, {
              width: amtW - 12,
              align: 'right',
            });
          doc
            .moveTo(M, y + rowH)
            .lineTo(M + contentW, y + rowH)
            .lineWidth(0.5)
            .strokeColor(BRAND.line)
            .stroke();
          y += rowH;
        });
        y += 18;

        // ── Totals ────────────────────────────────────────────
        const boxW = 240;
        const boxX = M + contentW - boxW;
        const totLine = (lbl: string, val: string, color: string) => {
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor(BRAND.muted)
            .text(lbl, boxX, y);
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor(color)
            .text(val, boxX, y, { width: boxW, align: 'right' });
          y += 18;
        };
        totLine('Subtotal', data.total, BRAND.ink);
        if (data.commissionAmount)
          totLine(
            `Commission (${data.commissionRate ?? ''})`,
            data.commissionAmount,
            BRAND.success,
          );
        y += 4;
        doc.roundedRect(boxX, y, boxW, 40, 8).fill(BRAND.primary);
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#cfe0e4')
          .text(
            isCreditNote ? 'TOTAL CREDITED' : 'TOTAL PAID',
            boxX + 14,
            y + 14,
          );
        doc
          .font('Helvetica-Bold')
          .fontSize(15)
          .fillColor('#ffffff')
          .text(data.total, boxX, y + 11, { width: boxW - 14, align: 'right' });
        y += 40 + 26;

        // ── Notes ─────────────────────────────────────────────
        const notes = [
          isCreditNote
            ? 'This credit note reflects a refund processed against the referenced invoice.'
            : 'Payment received in full. This is a system-generated tax invoice and is valid without signature.',
          'Fares, taxes and supplier fees are non-refundable except as permitted by the airline / hotel fare rules. Cancellation and change penalties may apply per supplier terms.',
          `For assistance, contact ${TRAVELSOTA_ISSUER.email} quoting reference ${data.bookingRef}.`,
        ];
        const notesTop = y;
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor(BRAND.primary)
          .text('NOTES & TERMS', M + 14, y + 12);
        let ny = y + 26;
        for (const n of notes) {
          doc
            .font('Helvetica')
            .fontSize(8.5)
            .fillColor(BRAND.muted)
            .text(n, M + 14, ny, { width: contentW - 28, lineGap: 1 });
          ny = doc.y + 4;
        }
        const notesH = ny - notesTop + 8;
        doc.rect(M, notesTop, 3, notesH).fill(BRAND.accent);

        // ── Footer ────────────────────────────────────────────
        const footY = doc.page.height - 64;
        doc
          .moveTo(M, footY)
          .lineTo(M + contentW, footY)
          .lineWidth(0.5)
          .strokeColor(BRAND.line)
          .stroke();
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(BRAND.primary)
          .text(
            `Thank you for booking with ${TRAVELSOTA_ISSUER.brandName}.`,
            M,
            footY + 10,
            { width: contentW, align: 'center' },
          );
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(BRAND.muted)
          .text(
            `${TRAVELSOTA_ISSUER.legalName} · ${TRAVELSOTA_ISSUER.website}`,
            M,
            footY + 26,
            { width: contentW, align: 'center' },
          );
        doc
          .fontSize(8)
          .fillColor(BRAND.muted)
          .text(TRAVELSOTA_ISSUER.accreditation, M, footY + 38, {
            width: contentW,
            align: 'center',
          });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async loadPdfKit(): Promise<PDFKit.PDFDocument | null> {
    try {
      const pdfkit = (await import('pdfkit')) as unknown as {
        default?: PDFKit.PDFDocument;
      } & PDFKit.PDFDocument;
      return pdfkit.default ?? pdfkit;
    } catch {
      return null;
    }
  }

  // ── Credit Note Methods ────────────────────────────────────

  async getCreditNotesForInvoice(
    invoiceId: string,
  ): Promise<InvoiceListItem[]> {
    const docs = await this.prisma.bookingDocument.findMany({
      where: {
        relatedToId: invoiceId,
        documentType: 'credit_note',
      },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map((doc) => this.mapListItem(doc));
  }

  /**
   * Called from RefundService after a cancellation is processed.
   * Finds the active invoice for the booking and creates a linked credit note.
   */
  async generateCreditNoteForRefund(
    bookingId: string,
    refundDetails: {
      refundAmount: number;
      cancellationFee: number;
      reason?: string;
    },
  ): Promise<GeneratedInvoiceDocument | null> {
    const original = await this.prisma.bookingDocument.findFirst({
      where: {
        bookingId,
        documentType: 'invoice',
        status: { notIn: ['cancelled', 'void', 'refunded'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!original) {
      this.logger.warn(
        `No active invoice found for booking ${bookingId} — skipping credit note generation`,
      );
      return null;
    }

    return this.generateCreditNote(bookingId, original.id, {
      reason:
        refundDetails.reason ??
        `Refund after cancellation. Fee: ${refundDetails.cancellationFee}, Net: ${refundDetails.refundAmount}`,
      refundAmount: refundDetails.refundAmount,
    });
  }

  // ── Admin Methods ───────────────────────────────────────────

  async regenerate(id: string): Promise<GeneratedInvoiceDocument> {
    const doc = await this.prisma.bookingDocument.findUnique({ where: { id } });
    if (!doc || doc.status === 'void') {
      throw new BusinessError(
        'INVOICE_NOT_FOUND',
        'Invoice not found or has been voided',
      );
    }

    const booking = await this.getBookingData(doc.bookingId);
    if (!booking) {
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${doc.bookingId} not found`,
      );
    }

    const invoiceNumber =
      doc.invoiceNumber ??
      `TVL-INV-${new Date().getFullYear()}-REGN-${doc.id.substring(0, 6).toUpperCase()}`;
    const agentInfo = await this.loadAgentInfo(booking.userId);
    const commission = await this.findCommissionNoTx(booking.id);
    const templateData = await this.buildTemplateData(
      booking,
      invoiceNumber,
      agentInfo,
      commission,
    );
    const htmlContent = this.renderInvoiceHtml(templateData);
    const pdfBuffer = await this.generatePdf(templateData);

    await this.prisma.bookingDocument.update({
      where: { id },
      data: {
        content: htmlContent,
        pdfData: pdfBuffer as unknown as Uint8Array<ArrayBuffer>,
        status: 'generated',
        metadata: {
          ...((doc.metadata ?? {}) as Record<string, unknown>),
          regeneratedAt: new Date().toISOString(),
        },
      },
    });

    await this.logAudit(
      'regenerate',
      'BookingDocument',
      id,
      `Invoice ${invoiceNumber} regenerated`,
    );
    this.logger.log(`Invoice ${invoiceNumber} regenerated`);

    return this.getById(id) as Promise<GeneratedInvoiceDocument>;
  }

  /** Hard-delete invoice documents (and their related credit notes). Irreversible. */
  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const docs = await this.prisma.bookingDocument.findMany({
      where: { id: { in: ids } },
      select: { id: true, relatedToId: true },
    });
    const docIds = new Set(docs.map((d) => d.id));
    // Pull in credit notes attached to any of these invoices
    const children = await this.prisma.bookingDocument.findMany({
      where: { relatedToId: { in: [...docIds] } },
      select: { id: true },
    });
    for (const c of children) docIds.add(c.id);

    const res = await this.prisma.bookingDocument.deleteMany({
      where: { id: { in: [...docIds] } },
    });

    await this.logAudit(
      'delete',
      'BookingDocument',
      ids.join(','),
      `${res.count} invoice document(s) deleted by admin.`,
    );
    return res.count;
  }

  async voidInvoice(id: string, reason: string): Promise<void> {
    const doc = await this.prisma.bookingDocument.findUnique({
      where: { id },
      select: { id: true, invoiceNumber: true, status: true },
    });
    if (!doc) throw new BusinessError('INVOICE_NOT_FOUND', 'Invoice not found');
    if (doc.status === 'void' || doc.status === 'refunded') {
      throw new BusinessError(
        'INVOICE_NOT_VOIDABLE',
        `Invoice cannot be voided (status: ${doc.status})`,
      );
    }

    await this.prisma.bookingDocument.update({
      where: { id },
      data: { status: 'void' },
    });

    await this.logAudit(
      'void',
      'BookingDocument',
      id,
      `Invoice ${doc.invoiceNumber ?? id} voided. Reason: ${reason}`,
    );
    this.logger.log(`Invoice ${doc.invoiceNumber ?? id} voided: ${reason}`);
  }

  async sendEmail(id: string): Promise<void> {
    const doc = await this.prisma.bookingDocument.findUnique({
      where: { id },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        bookingId: true,
        bookingType: true,
        amount: true,
        currency: true,
        userId: true,
        userType: true,
      },
    });
    if (!doc) throw new BusinessError('INVOICE_NOT_FOUND', 'Invoice not found');
    if (doc.status === 'email_pending') {
      throw new BusinessError(
        'INVOICE_ALREADY_QUEUED',
        'Invoice email is already pending',
      );
    }

    const customerName = await this.resolveCustomerName(doc.userId, doc.userType);

    await this.prisma.$transaction(async (tx) => {
      await this.outboxWriter.writeInTransaction(tx, {
        eventType: 'INVOICE_EMAIL',
        aggregateType: 'BookingDocument',
        aggregateId: id,
        idempotencyKey: `email:INVOICE_EMAIL:${id}`,
        payload: {
          documentId: id,
          invoiceNumber: doc.invoiceNumber,
          bookingId: doc.bookingId,
          bookingType: doc.bookingType,
          customerName,
          amount: doc.amount != null ? Number(doc.amount) : 0,
          currency: doc.currency ?? 'USD',
        },
      });

      await tx.bookingDocument.update({
        where: { id },
        data: { status: 'email_pending' },
      });
    });

    await this.logAudit(
      'email',
      'BookingDocument',
      id,
      `Invoice ${doc.invoiceNumber ?? id} queued for email`,
    );
    this.logger.log(`Invoice ${doc.invoiceNumber ?? id} queued for email`);
  }

  private async resolveCustomerName(userId?: string | null, userType?: string | null): Promise<string> {
    if (!userId) return 'Customer';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    }).catch(() => null);
    if (!user) return 'Customer';
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return name || user.email || 'Customer';
  }

  async generateCreditNote(
    bookingId: string,
    originalInvoiceId: string,
    options?: { reason?: string; refundAmount?: number; currency?: string },
  ): Promise<GeneratedInvoiceDocument> {
    const original = await this.prisma.bookingDocument.findUnique({
      where: { id: originalInvoiceId },
    });
    if (!original)
      throw new BusinessError(
        'INVOICE_NOT_FOUND',
        'Original invoice not found',
      );

    const currency = options?.currency ?? original.currency ?? 'USD';
    if (original.currency && currency !== original.currency) {
      throw new BusinessError(
        'CURRENCY_MISMATCH',
        'Credit note currency must match the original invoice currency',
      );
    }

    const booking = await this.getBookingData(bookingId);
    if (!booking)
      throw new BusinessError(
        'BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found`,
      );

    return this.prisma.$transaction(async (tx) => {
      const creditNoteNumber = await this.invoiceNumberService.nextNumber(tx, {
        documentType: 'credit_note',
        legalEntityCode: 'TVL',
      });

      // Round to the currency's minor unit so floating-point drift can't push a
      // full refund (e.g. 148.53300000000002) above the invoice total (148.53).
      const minorUnit = await this.currencyService.getDecimals(currency);
      const rawAmount =
        options?.refundAmount != null
          ? options.refundAmount
          : Number(booking.amount ?? 0);
      const amount = Number(rawAmount.toFixed(minorUnit));
      if (amount <= 0) {
        throw new BusinessError(
          'INVALID_AMOUNT',
          'Credit note amount must be greater than zero',
        );
      }

      // Cumulative credit notes must not exceed the original invoice paid amount.
      // Compare in integer minor units to stay free of floating-point noise.
      const originalPaid = Number(original.amount ?? 0);
      const amountMinor = await this.currencyService.toSmallestUnit(amount, currency);
      const originalPaidMinor = await this.currencyService.toSmallestUnit(originalPaid, currency);
      if (amountMinor > originalPaidMinor) {
        throw new BusinessError(
          'AMOUNT_EXCEEDS_INVOICE',
          `Credit note amount (${amount}) exceeds original invoice amount (${originalPaid})`,
        );
      }

      const existingCreditNotes = await tx.bookingDocument.findMany({
        where: {
          relatedToId: originalInvoiceId,
          documentType: 'credit_note',
          status: { notIn: ['cancelled', 'void'] },
        },
        select: { amount: true },
      });
      // Same currency for every credit note in this reduce — compute the
      // factor once instead of round-tripping through CurrencyService per item.
      const minorFactor = Math.pow(10, minorUnit);
      const totalCreditedMinor = existingCreditNotes.reduce(
        (sum, cn) => sum + Math.round(Number(cn.amount ?? 0) * minorFactor),
        0,
      );
      if (totalCreditedMinor + amountMinor > originalPaidMinor) {
        const factor = Math.pow(10, minorUnit);
        const totalCredited = (totalCreditedMinor + amountMinor) / factor;
        const remaining = (originalPaidMinor - totalCreditedMinor) / factor;
        throw new BusinessError(
          'CREDIT_NOTE_EXCEEDS_REMAINING',
          `Cumulative credit notes (${totalCredited}) would exceed original invoice amount (${originalPaid}). Remaining credit available: ${remaining}`,
        );
      }

      const [formattedAmount, formattedTotal] = await Promise.all([
        this.currencyService.formatWithCode(amount, currency),
        this.currencyService.formatWithCode(-amount, currency),
      ]);

      const templateData: InvoiceTemplateData = {
        agentName: '',
        agentCompany: '',
        agentAddress: '',
        agentTaxId: '',
        bookingRef: original.invoiceNumber ?? booking.id.substring(0, 8),
        bookingType: booking.bookingType,
        bookingDate: booking.createdAt.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        amount: formattedAmount,
        currency,
        status: 'credit_note',
        passengerName: '',
        route: '',
        provider: booking.provider,
        invoiceNumber: creditNoteNumber,
        lineItems: [
          {
            description: `Credit note for invoice ${original.invoiceNumber ?? originalInvoiceId}`,
            amount: formattedAmount,
          },
        ],
        total: formattedTotal,
      };

      const htmlContent = this.renderInvoiceHtml(templateData);
      const pdfBuffer = await this.generatePdf(templateData);

      // Use creditNoteNumber as docSubType so multiple credit notes per booking
      // don't collide on the active-document unique index.
      const doc = await tx.bookingDocument.create({
        data: {
          bookingId,
          bookingType: booking.bookingType,
          documentType: 'credit_note',
          docSubType: creditNoteNumber,
          invoiceNumber: null,
          creditNoteNumber,
          userId: booking.userId,
          userType: booking.userType,
          amount: String(amount),
          currency,
          content: htmlContent,
          pdfData: pdfBuffer as unknown as Uint8Array<ArrayBuffer>,
          fileName: `credit-note-${creditNoteNumber}.pdf`,
          mimeType: 'application/pdf',
          status: 'generated',
          relatedToId: originalInvoiceId,
          metadata: {
            reason: options?.reason ?? null,
            originalInvoiceNumber: original.invoiceNumber,
          },
        },
      });

      // Only mark the invoice as refunded if the cumulative credit now equals or exceeds the invoice
      const newTotalCreditedMinor = totalCreditedMinor + amountMinor;
      if (newTotalCreditedMinor >= originalPaidMinor) {
        await tx.bookingDocument.update({
          where: { id: originalInvoiceId },
          data: { status: 'refunded' },
        });
      }

      return this.mapDocument(doc);
    });
  }

  async exportCsv(filters: InvoiceListFilters = {}): Promise<string> {
    // listForAdmin clamps limit at 100 — walk pages so exports are complete,
    // capped at 10k rows to bound memory/time on huge datasets.
    const all: Awaited<ReturnType<typeof this.listForAdmin>>['items'] = [];
    let page = 1;
    for (;;) {
      const result = await this.listForAdmin({ ...filters, page, limit: 1000 });
      all.push(...result.items);
      if (result.items.length === 0 || all.length >= result.total || all.length >= 10000 || page >= result.totalPages) break;
      page += 1;
    }
    const items = all.slice(0, 10000);

    const header =
      'Invoice Number,Booking ID,Type,Status,Amount,Currency,Created At';
    const rows = items.map((item) =>
      [
        item.invoiceNumber ?? '',
        item.bookingId,
        item.bookingType,
        item.status,
        item.amount ?? '',
        item.currency ?? '',
        item.createdAt,
      ]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(','),
    );

    return [header, ...rows].join('\n');
  }

  async markEmailSent(
    id: string,
    invoiceNumber?: string | null,
  ): Promise<void> {
    await this.prisma.bookingDocument.updateMany({
      where: { id, status: 'email_pending' },
      data: { status: 'sent', sentAt: new Date() },
    });
    this.logger.log(`Invoice ${invoiceNumber ?? id} marked as sent`);
  }

  // ── Audit Logging ──────────────────────────────────────────

  private async logAudit(
    action: string,
    entity: string,
    entityId: string,
    description: string,
    metadata?: any,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        description,
        ...(metadata ? { metadata } : {}),
      },
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private mapDocument(doc: any): GeneratedInvoiceDocument {
    return {
      id: doc.id,
      bookingId: doc.bookingId,
      bookingType: doc.bookingType === 'hotel' ? 'hotel' : 'flight',
      documentType: doc.documentType,
      invoiceNumber: doc.invoiceNumber ?? null,
      creditNoteNumber: doc.creditNoteNumber ?? null,
      content: doc.content,
      fileName: doc.fileName,
      pdfBuffer: doc.pdfData ?? undefined,
      status: doc.status,
      createdAt: doc.createdAt?.toISOString?.(),
    };
  }

  private mapListItem(doc: any): InvoiceListItem {
    return {
      id: doc.id,
      bookingId: doc.bookingId,
      bookingType: doc.bookingType,
      invoiceNumber: doc.invoiceNumber ?? null,
      creditNoteNumber: doc.creditNoteNumber ?? null,
      fileName: doc.fileName,
      status: doc.status,
      amount: doc.amount != null ? String(doc.amount) : null,
      currency: doc.currency ?? null,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  private isUniqueConflict(error: any): boolean {
    return error?.code === 'P2002';
  }
}
