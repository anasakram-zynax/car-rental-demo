import type {
  FlightBookingExtraEntity,
  CreateFlightBookingExtraInput,
  UpdateFlightBookingExtraInput,
} from '../../domain/entities/flight-booking-extra.entity';

export interface FlightBookingExtraRepoPort {
  create(data: CreateFlightBookingExtraInput): Promise<FlightBookingExtraEntity>;
  update(
    id: string,
    patch: UpdateFlightBookingExtraInput,
  ): Promise<FlightBookingExtraEntity | null>;
  findById(id: string): Promise<FlightBookingExtraEntity | null>;
  findByBookingId(bookingId: string): Promise<FlightBookingExtraEntity[]>;
  findByBookingIdAndType(
    bookingId: string,
    type: string,
  ): Promise<FlightBookingExtraEntity[]>;
  findByBookingIdAndStatus(
    bookingId: string,
    status: string,
  ): Promise<FlightBookingExtraEntity[]>;
}

export const FlightBookingExtraRepoPortToken = Symbol('FlightBookingExtraRepoPort');
