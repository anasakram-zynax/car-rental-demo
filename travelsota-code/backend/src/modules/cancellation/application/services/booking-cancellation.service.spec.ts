import { Test } from '@nestjs/testing';
import { BookingCancellationService } from './booking-cancellation.service';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { FlightBookingRepoPortToken } from '../../../flights/application/ports/flight-booking-repo.port';
import { HotelBookingRepoPortToken } from '../../../hotels/application/ports/hotel-booking-repo.port';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { PaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('BookingCancellationService', () => {
  let service: BookingCancellationService;
  let paymentRepo: jest.Mocked<PaymentRepository>;
  let orchestrator: jest.Mocked<PaymentOrchestratorService>;
  let flightBookingRepo: { findById: jest.Mock; update: jest.Mock };
  let hotelBookingRepo: { findById: jest.Mock; update: jest.Mock };

  const mockFlightBooking = {
    id: 'fb-1',
    status: 'booked',
    provider: 'travelport',
  };

  const mockHotelBooking = {
    id: 'hb-1',
    status: 'booked',
    provider: 'hotelbeds',
  };

  beforeEach(async () => {
    flightBookingRepo = { findById: jest.fn(), update: jest.fn() };
    hotelBookingRepo = { findById: jest.fn(), update: jest.fn() };

    paymentRepo = {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    } as any;

    orchestrator = { getGateway: jest.fn() } as any;

    const module = await Test.createTestingModule({
      providers: [
        BookingCancellationService,
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: PaymentOrchestratorService, useValue: orchestrator },
        { provide: FlightBookingRepoPortToken, useValue: flightBookingRepo },
        { provide: HotelBookingRepoPortToken, useValue: hotelBookingRepo },
      ],
    }).compile();

    service = module.get<BookingCancellationService>(BookingCancellationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('cancelBooking for FLIGHT', () => {
    it('cancels flight booking with refund when payment is PAID', async () => {
      flightBookingRepo.findById.mockResolvedValue(mockFlightBooking);
      const mockPayment = { id: 'pay-1', gateway: PaymentGateway.STRIPE, status: PaymentStatus.PAID, providerPaymentId: 'pi_xxx' };
      paymentRepo.findMany.mockResolvedValue([mockPayment] as any);
      const mockGateway = { refundPayment: jest.fn().mockResolvedValue(undefined) };
      orchestrator.getGateway.mockReturnValue(mockGateway as any);

      const result = await service.cancelBooking('fb-1', 'FLIGHT');

      expect(result.status).toBe('cancelled');
      expect(result.bookingType).toBe('FLIGHT');
      expect(mockGateway.refundPayment).toHaveBeenCalledWith('pi_xxx');
      expect(paymentRepo.update).toHaveBeenCalled();
      expect(flightBookingRepo.update).toHaveBeenCalledWith('fb-1', expect.objectContaining({ status: 'cancelled' }));
    });

    it('cancels flight booking with cancel when payment is PENDING', async () => {
      flightBookingRepo.findById.mockResolvedValue(mockFlightBooking);
      const mockPayment = { id: 'pay-1', gateway: PaymentGateway.PAYPAL, status: PaymentStatus.PENDING, providerPaymentId: 'PAYPAL-123' };
      paymentRepo.findMany.mockResolvedValue([mockPayment] as any);
      const mockGateway = { cancelPayment: jest.fn().mockResolvedValue(undefined) };
      orchestrator.getGateway.mockReturnValue(mockGateway as any);

      const result = await service.cancelBooking('fb-1', 'FLIGHT');

      expect(result.status).toBe('cancelled');
      expect(mockGateway.cancelPayment).toHaveBeenCalledWith('PAYPAL-123');
    });

    it('throws NotFoundException when flight booking missing', async () => {
      flightBookingRepo.findById.mockResolvedValue(null);
      await expect(service.cancelBooking('not-found', 'FLIGHT')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for non-cancellable flight status', async () => {
      flightBookingRepo.findById.mockResolvedValue({ ...mockFlightBooking, status: 'failed' });
      await expect(service.cancelBooking('fb-1', 'FLIGHT')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelBooking for HOTEL', () => {
    it('cancels hotel booking with refund', async () => {
      hotelBookingRepo.findById.mockResolvedValue(mockHotelBooking);
      const mockPayment = { id: 'pay-2', gateway: PaymentGateway.STRIPE, status: PaymentStatus.PAID, providerPaymentId: 'pi_yyy' };
      paymentRepo.findMany.mockResolvedValue([mockPayment] as any);
      const mockGateway = { refundPayment: jest.fn().mockResolvedValue(undefined) };
      orchestrator.getGateway.mockReturnValue(mockGateway as any);

      const result = await service.cancelBooking('hb-1', 'HOTEL');

      expect(result.status).toBe('cancelled');
      expect(result.bookingType).toBe('HOTEL');
      expect(hotelBookingRepo.update).toHaveBeenCalledWith('hb-1', expect.objectContaining({ status: 'cancelled' }));
    });

    it('throws NotFoundException when hotel booking missing', async () => {
      hotelBookingRepo.findById.mockResolvedValue(null);
      await expect(service.cancelBooking('not-found', 'HOTEL')).rejects.toThrow(NotFoundException);
    });
  });
});
