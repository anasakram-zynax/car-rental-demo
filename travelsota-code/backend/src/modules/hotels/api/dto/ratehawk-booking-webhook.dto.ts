export class RatehawkBookingWebhookDto {
  event_type: string;
  partner_order_id?: string;
  order_id?: string;
  status?: string;
  timestamp?: string;
  data?: Record<string, unknown>;

  get dedupeKey(): string {
    return `${this.event_type}_${this.partner_order_id ?? this.order_id ?? 'unknown'}`;
  }
}
