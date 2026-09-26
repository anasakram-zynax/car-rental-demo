export enum EmailMessageStatus {
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
  SKIPPED = 'skipped',
}

export enum EmailRecipientStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  FAILED = 'failed',
}

export enum EmailDeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

export enum EmailSeverity {
  INFO = 'info',
  CRITICAL = 'critical',
}
