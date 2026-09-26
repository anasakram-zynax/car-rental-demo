import { Injectable } from '@nestjs/common';

const DOCUMENT_PREFIX: Record<string, string> = {
  invoice: 'INV',
  credit_note: 'CN',
  receipt: 'RCP',
  voucher: 'VCH',
};

@Injectable()
export class InvoiceNumberService {
  async nextNumber(
    tx: any,
    options: {
      documentType: 'invoice' | 'credit_note' | 'receipt' | 'voucher';
      legalEntityCode?: string;
      date?: Date;
    },
  ): Promise<string> {
    const date = options.date ?? new Date();
    const year = date.getUTCFullYear();
    const entityType = options.legalEntityCode ?? 'TVL';
    const documentType = DOCUMENT_PREFIX[options.documentType] ?? 'DOC';

    const sequence = await tx.invoiceSequence.upsert({
      where: {
        year_entityType_documentType: {
          year,
          entityType,
          documentType,
        },
      },
      create: {
        year,
        entityType,
        documentType,
        lastNumber: 1,
      },
      update: {
        lastNumber: { increment: 1 },
      },
      select: {
        lastNumber: true,
      },
    });

    return `${entityType}-${documentType}-${year}-${String(sequence.lastNumber).padStart(6, '0')}`;
  }
}
