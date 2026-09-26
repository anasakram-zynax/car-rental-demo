import { Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { CurrencyService } from '../currency/application/services/currency.service';

export interface GeneratedDocument {
  id: string;
  bookingId: string;
  documentType: 'voucher' | 'invoice';
  content: string; // HTML for preview
  fileName: string;
  pdfBuffer?: Uint8Array;
}

export interface DocumentTemplateData {
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

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Generate a voucher (itinerary/receipt) for a booking.
   * Creates a BookingDocument record with PDF content.
   */
  async generateVoucher(bookingId: string): Promise<GeneratedDocument> {
    // Idempotency check: return existing if already generated
    const existing = await this.getDocument(bookingId, 'voucher');
    if (existing) return existing;

    const booking = await this.getBookingData(bookingId);
    if (!booking) throw new BusinessError('BOOKING_NOT_FOUND', `Booking ${bookingId} not found`);

    const templateData = await this.buildTemplateData(booking, 'voucher');
    const htmlContent = this.renderVoucherHtml(templateData);
    const fileName = `voucher-${booking.bookingType}-${bookingId.substring(0, 8)}.pdf`;
    const pdfBuffer = await this.generatePdf(htmlContent);

    // Store in database
    const doc = await this.prisma.bookingDocument.create({
      data: {
        bookingId,
        bookingType: booking.bookingType,
        documentType: 'voucher',
        content: htmlContent,
        pdfData: pdfBuffer as unknown as Uint8Array<ArrayBuffer>,
        fileName,
        mimeType: 'application/pdf',
        status: 'generated',
      },
    });

    this.logger.log(`Voucher generated for booking ${bookingId} (${doc.id})`);

    return {
      id: doc.id,
      bookingId,
      documentType: 'voucher',
      content: htmlContent,
      fileName,
      pdfBuffer,
    };
  }

  /**
   * Generate an invoice for a booking with agent info and pricing breakdown.
   */
  async generateInvoice(bookingId: string): Promise<GeneratedDocument> {
    // Idempotency check: return existing if already generated
    const existing = await this.getDocument(bookingId, 'invoice');
    if (existing) return existing;

    const booking = await this.getBookingData(bookingId);
    if (!booking) throw new BusinessError('BOOKING_NOT_FOUND', `Booking ${bookingId} not found`);

    const templateData = await this.buildTemplateData(booking, 'invoice');
    const htmlContent = this.renderInvoiceHtml(templateData);
    const fileName = `invoice-${booking.bookingType}-${bookingId.substring(0, 8)}.pdf`;
    const pdfBuffer = await this.generatePdf(htmlContent);

    const doc = await this.prisma.bookingDocument.create({
      data: {
        bookingId,
        bookingType: booking.bookingType,
        documentType: 'invoice',
        content: htmlContent,
        pdfData: pdfBuffer as unknown as Uint8Array<ArrayBuffer>,
        fileName,
        mimeType: 'application/pdf',
        status: 'generated',
      },
    });

    this.logger.log(`Invoice generated for booking ${bookingId} (${doc.id})`);

    return {
      id: doc.id,
      bookingId,
      documentType: 'invoice',
      content: htmlContent,
      fileName,
      pdfBuffer,
    };
  }

  /**
   * Auto-generate voucher + invoice for a booking (called via outbox).
   */
  async autoGenerate(bookingId: string): Promise<void> {
    if (!bookingId) {
      this.logger.warn('autoGenerate called without bookingId');
      return;
    }

    try {
      await this.generateVoucher(bookingId);
      await this.generateInvoice(bookingId);
      this.logger.log(`Auto-generated voucher + invoice for booking ${bookingId}`);
    } catch (error: any) {
      this.logger.error(`Failed to auto-generate documents for booking ${bookingId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the latest document for a booking by type.
   */
  async getDocument(bookingId: string, documentType: 'voucher' | 'invoice'): Promise<GeneratedDocument | null> {
    const doc = await this.prisma.bookingDocument.findFirst({
      where: { bookingId, documentType },
      orderBy: { createdAt: 'desc' },
    });
    if (!doc) return null;

    return {
      id: doc.id,
      bookingId,
      documentType: doc.documentType as 'voucher' | 'invoice',
      content: doc.content,
      fileName: doc.fileName,
      pdfBuffer: doc.pdfData ?? undefined,
    };
  }

  /**
   * Get all invoices for an agent (admin view).
   */
  async getAgentInvoices(agentUserId: string): Promise<Array<{
    id: string;
    bookingId: string;
    bookingType: string;
    fileName: string;
    status: string;
    createdAt: string;
  }>> {
    // Find all bookings for this user
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

    const allBookingIds = [...flightIds.map((f) => f.id), ...hotelIds.map((h) => h.id)];
    if (allBookingIds.length === 0) return [];

    const docs = await this.prisma.bookingDocument.findMany({
      where: {
        bookingId: { in: allBookingIds },
        documentType: 'invoice',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return docs.map((d) => ({
      id: d.id,
      bookingId: d.bookingId,
      bookingType: d.bookingType,
      fileName: d.fileName,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  // ── Private Helpers ──────────────────────────────────────

  private async getBookingData(bookingId: string): Promise<{
    id: string;
    bookingType: 'flight' | 'hotel';
    status: string;
    amount: number | null;
    currency: string | null;
    userId: string | null;
    offerSnapshot: any;
    travelerSnapshot: any;
    holder: any;
    locatorCode: string | null;
    hotelbedsRef: string | null;
    supplierReference: string | null;
    provider: string;
    createdAt: Date;
  } | null> {
    const flight = await this.prisma.flightBooking.findUnique({ where: { id: bookingId } });
    if (flight) {
      return {
        id: flight.id,
        bookingType: 'flight',
        status: flight.status,
        amount: flight.amount,
        currency: flight.currency,
        userId: flight.userId,
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

    const hotel = await this.prisma.hotelBooking.findUnique({ where: { id: bookingId } });
    if (hotel) {
      return {
        id: hotel.id,
        bookingType: 'hotel',
        status: hotel.status,
        amount: hotel.amount,
        currency: hotel.currency,
        userId: hotel.userId,
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

  private async buildTemplateData(
    booking: NonNullable<Awaited<ReturnType<typeof this.getBookingData>>>,
    docType: 'voucher' | 'invoice',
  ): Promise<DocumentTemplateData> {
    // Fetch agent info
    let agentName = '';
    let agentCompany = '';
    let agentAddress = '';
    let agentTaxId = '';
    let passengerName = '';
    let route = '';

    if (booking.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: booking.userId },
        select: {
          firstName: true,
          lastName: true,
          agentProfile: {
            select: { companyName: true, companyAddress: true, taxId: true },
          },
        },
      });
      if (user) {
        agentName = [user.firstName, user.lastName].filter(Boolean).join(' ');
        agentCompany = user.agentProfile?.companyName ?? '';
        agentAddress = user.agentProfile?.companyAddress ?? '';
        agentTaxId = user.agentProfile?.taxId ?? '';
      }
    }

    if (booking.bookingType === 'flight') {
      passengerName = (booking.travelerSnapshot as any)?.[0]
        ? `${(booking.travelerSnapshot as any)[0].firstName ?? ''} ${(booking.travelerSnapshot as any)[0].lastName ?? ''}`
        : '';
      route = `${(booking.offerSnapshot as any)?.from ?? ''} → ${(booking.offerSnapshot as any)?.to ?? ''}`;
    } else {
      passengerName = (booking.holder as any)?.name ?? '';
      route = (booking.offerSnapshot as any)?.name ?? '';
    }

    // Fetch commission data for invoices
    const commissionRecord = docType === 'invoice'
      ? await this.prisma.commissionRecord.findFirst({
          where: { bookingId: booking.id },
          select: { commissionAmount: true, rate: true, rateType: true },
        })
      : null;

    const bookingCurrency = booking.currency ?? 'USD';
    const formattedAmount = await this.currencyService.formatWithCode(booking.amount ?? 0, bookingCurrency);

    const lineItems = [
      { description: `Base ${booking.bookingType} booking`, amount: formattedAmount },
    ];

    let commissionAmount: string | undefined;
    let commissionRate: string | undefined;

    if (commissionRecord) {
      commissionAmount = await this.currencyService.formatWithCode(Number(commissionRecord.commissionAmount), bookingCurrency);
      commissionRate = `${Number(commissionRecord.rate)}${commissionRecord.rateType === 'percentage' ? '%' : ''}`;
      lineItems.push({
        description: `Commission earned (${commissionRate})`,
        amount: commissionAmount,
      });
    }

    const invoiceNumber = `INV-${booking.id.substring(0, 8).toUpperCase()}-${new Date().getFullYear()}`;

    return {
      commissionAmount,
      commissionRate,
      agentName,
      agentCompany,
      agentAddress,
      agentTaxId,
      bookingRef: booking.locatorCode ?? booking.supplierReference ?? booking.hotelbedsRef ?? booking.id.substring(0, 8),
      bookingType: booking.bookingType,
      bookingDate: booking.createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      amount: formattedAmount,
      currency: bookingCurrency,
      status: booking.status,
      passengerName,
      route,
      departureDate: (booking.offerSnapshot as any)?.departureDate
        ? new Date((booking.offerSnapshot as any).departureDate).toLocaleDateString()
        : '',
      provider: booking.provider,
      invoiceNumber,
      lineItems,
      total: formattedAmount,
    };
  }

  /**
   * Render voucher HTML with booking details, itinerary, and payment info.
   * Designed for clean printing.
   */
  private renderVoucherHtml(data: DocumentTemplateData): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Booking Voucher — ${data.bookingRef}</title>
  <style>
    @page { margin: 20mm 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Helvetica', 'Arial', sans-serif; }
    body { color: #1a1a2e; font-size: 11pt; line-height: 1.5; }
    .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
    .header h1 { color: #2563eb; font-size: 22pt; margin-bottom: 4px; }
    .header p { color: #6b7280; font-size: 9pt; }
    .ref-badge { display: inline-block; background: #eff6ff; color: #2563eb; padding: 4px 12px; border-radius: 4px; font-size: 10pt; font-weight: bold; margin-top: 6px; }
    .section { margin-bottom: 16px; }
    .section h2 { font-size: 12pt; color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; padding: 2px 0; }
    .label { color: #6b7280; font-size: 10pt; }
    .value { font-weight: 500; font-size: 10pt; }
    .grid-2 { display: flex; flex-wrap: wrap; gap: 8px; }
    .grid-2 > div { flex: 1; min-width: 45%; background: #f9fafb; padding: 10px; border-radius: 6px; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 9pt; font-weight: 600; }
    .status-booked { background: #d1fae5; color: #065f46; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-cancelled { background: #fee2e2; color: #991b1b; }
    .total-row { border-top: 2px solid #2563eb; padding-top: 6px; margin-top: 6px; font-size: 12pt; font-weight: bold; }
    .footer { margin-top: 24px; text-align: center; color: #9ca3af; font-size: 8pt; border-top: 1px solid #e5e7eb; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Booking Voucher</h1>
    <p>${data.agentCompany || data.agentName} — Travel Services</p>
    <div class="ref-badge">Ref: ${data.bookingRef}</div>
  </div>

  <div class="section">
    <h2>Itinerary Summary</h2>
    <div class="grid-2">
      <div>
        <div class="row"><span class="label">Type</span><span class="value" style="text-transform:capitalize">${data.bookingType}</span></div>
        <div class="row"><span class="label">Route</span><span class="value">${data.route || '—'}</span></div>
        <div class="row"><span class="label">Departure</span><span class="value">${data.departureDate || '—'}</span></div>
      </div>
      <div>
        <div class="row"><span class="label">Status</span><span class="value"><span class="status-badge status-${data.status}">${data.status.toUpperCase()}</span></span></div>
        <div class="row"><span class="label">Provider</span><span class="value" style="text-transform:capitalize">${data.provider}</span></div>
        <div class="row"><span class="label">Passenger</span><span class="value">${data.passengerName || '—'}</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Booking Details</h2>
    <div class="row"><span class="label">Reference</span><span class="value">${data.bookingRef}</span></div>
    <div class="row"><span class="label">Booking Date</span><span class="value">${data.bookingDate}</span></div>
    <div class="row"><span class="label">Total Amount</span><span class="value" style="font-size:13pt;color:#2563eb">${data.amount}</span></div>
    <div class="row"><span class="label">Currency</span><span class="value">${data.currency}</span></div>
  </div>

  <div class="section">
    <h2>Payment Information</h2>
    <div class="row"><span class="label">Payment Status</span><span class="value">${data.status === 'cancelled' ? 'Refunded' : 'Paid'}</span></div>
    <div class="row"><span class="label">Amount Paid</span><span class="value">${data.amount}</span></div>
  </div>

  <div class="footer">
    <p>Generated on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
    <p>${data.agentCompany}${data.agentAddress ? ` | ${data.agentAddress}` : ''}${data.agentTaxId ? ` | TAX: ${data.agentTaxId}` : ''}</p>
  </div>
</body>
</html>`;
  }

  /**
   * Render invoice HTML with agent letterhead, line items, and totals.
   */
  private renderInvoiceHtml(data: DocumentTemplateData): string {
    // Filter out commission from line items — shown separately in totals
    const filteredLines = data.lineItems.filter((item) => !item.description.startsWith('Commission'));
    const lineItemRows = filteredLines
      .map(
        (item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.description}</td>
        <td style="text-align:right">${item.amount}</td>
      </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice — ${data.invoiceNumber}</title>
  <style>
    @page { margin: 20mm 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Helvetica', 'Arial', sans-serif; }
    body { color: #1a1a2e; font-size: 10pt; line-height: 1.5; }
    .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
    .letterhead .left h1 { color: #2563eb; font-size: 24pt; margin-bottom: 2px; }
    .letterhead .left p { color: #6b7280; font-size: 9pt; }
    .letterhead .right { text-align: right; }
    .letterhead .right .invoice-label { font-size: 18pt; font-weight: bold; color: #1a1a2e; }
    .letterhead .right .invoice-number { font-size: 9pt; color: #6b7280; }
    .address-block { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .address-block > div { width: 48%; }
    .address-block h3 { font-size: 10pt; color: #6b7280; margin-bottom: 4px; }
    .address-block p { font-size: 10pt; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #2563eb; color: white; padding: 8px 10px; text-align: left; font-size: 9pt; text-transform: uppercase; }
    td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 10pt; }
    .totals { text-align: right; margin-top: 8px; }
    .totals .row { display: flex; justify-content: flex-end; gap: 20px; padding: 3px 0; }
    .totals .row .label { min-width: 100px; text-align: right; }
    .totals .row .value { min-width: 100px; text-align: right; }
    .totals .grand-total { border-top: 2px solid #2563eb; padding-top: 6px; font-size: 13pt; font-weight: bold; color: #2563eb; }
    .footer { margin-top: 30px; text-align: center; color: #9ca3af; font-size: 8pt; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    .terms { margin-top: 16px; font-size: 8pt; color: #6b7280; }
  </style>
</head>
<body>
  <div class="letterhead">
    <div class="left">
      <h1>${data.agentCompany || data.agentName || 'Travel Agency'}</h1>
      <p>${data.agentAddress || ''}</p>
      <p>TAX ID: ${data.agentTaxId || 'N/A'}</p>
    </div>
    <div class="right">
      <div class="invoice-label">INVOICE</div>
      <div class="invoice-number">${data.invoiceNumber}</div>
    </div>
  </div>

  <div class="address-block">
    <div>
      <h3>Bill To</h3>
      <p>${data.agentName || 'Agent'}</p>
      <p>${data.agentCompany || ''}</p>
      <p>${data.agentAddress || ''}</p>
    </div>
    <div>
      <h3>Invoice Details</h3>
      <p>Date: ${data.bookingDate}</p>
      <p>Booking Ref: ${data.bookingRef}</p>
      <p>Type: ${data.bookingType.charAt(0).toUpperCase() + data.bookingType.slice(1)}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>#</th><th>Description</th><th>Amount</th></tr>
    </thead>
    <tbody>
      ${lineItemRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="row">
      <span class="label">Subtotal</span>
      <span class="value">${data.total}</span>
    </div>
    ${data.commissionAmount ? `
    <div class="row">
      <span class="label">Commission (${data.commissionRate ?? ''})</span>
      <span class="value" style="color:#059669">${data.commissionAmount}</span>
    </div>
    ` : ''}
    <div class="row grand-total">
      <span class="label">Net Due</span>
      <span class="value">${data.total}</span>
    </div>
  </div>

  <div class="terms">
    <p><strong>Route:</strong> ${data.route || 'N/A'} | <strong>Passenger:</strong> ${data.passengerName || 'N/A'} | <strong>Provider:</strong> ${data.provider}</p>
    <p>This invoice was automatically generated. Thank you for your business.</p>
  </div>

  <div class="footer">
    <p>${data.agentCompany || data.agentName}${data.agentAddress ? ` — ${data.agentAddress}` : ''}</p>
    <p>Invoice ${data.invoiceNumber} — Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
  </div>
</body>
</html>`;
  }

  /**
   * Generate a PDF buffer from HTML content using PDFKit.
   * PDFKit doesn't handle HTML directly, so we render HTML-to-text layout
   * and build a structured PDF.
   *
   * For production, consider using Puppeteer or a dedicated HTML-to-PDF service.
   */
  private async generatePdf(htmlContent: string): Promise<Buffer> {
    // Dynamic import of pdfkit
    const PDFDocument = await this.loadPdfKit();
    if (!PDFDocument) {
      // Fallback: return the HTML content as a Buffer (can be saved as .html)
      this.logger.warn('PDFKit not available — returning HTML content as fallback');
      return Buffer.from(htmlContent);
    }

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: 'Booking Document',
            Creator: 'TravelsOTA Document Service',
            Producer: 'PDFKit',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Simple structured PDF rendering (stripped HTML -> PDF)
        const text = htmlContent
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        // Title
        doc.fontSize(22).font('Helvetica-Bold').text('Booking Document', { align: 'center' });
        doc.moveDown(1.5);

        // Content with basic formatting
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            doc.moveDown(0.5);
            continue;
          }

          // Detect headers (uppercase lines or lines ending with ':')
          if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
            doc.fontSize(12).font('Helvetica-Bold').text(trimmed);
            doc.moveDown(0.3);
          } else if (trimmed.endsWith(':')) {
            doc.fontSize(11).font('Helvetica-Bold').text(trimmed);
            doc.moveDown(0.2);
          } else {
            doc.fontSize(10).font('Helvetica').text(trimmed, {
              indent: 10,
            });
            doc.moveDown(0.1);
          }
        }

        // Footer
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica').fillColor('#9ca3af').text(
          `Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} — TravelsOTA Document Service`,
          { align: 'center' },
        );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private async loadPdfKit(): Promise<any | null> {
    try {
      const pdfkit = await import('pdfkit');
      return pdfkit.default || pdfkit;
    } catch {
      return null;
    }
  }
}
