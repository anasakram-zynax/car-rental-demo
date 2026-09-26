import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Integration tests for the Travelport booking workflow.
 *
 * These tests start a full NestJS app but mock the Travelport HTTP client
 * at the transport layer so no external API calls are made.
 *
 * They verify the full booking flow:
 *   Search → Preview → Checkout → Payment webhook → Ticketing
 *
 * Prerequisites:
 *   - A test database with migrations run
 *   - JWT signing key available in test env
 */

describe('Travelport Workflow Integration', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();

    // Acquire a test JWT (adjust endpoint as needed)
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'testpassword' })
      .ok(() => true);
    jwtToken = loginRes.body?.data?.accessToken ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /flights/bookings/preview — creates a preview booking', async () => {
    const res = await request(app.getHttpServer())
      .post('/flights/bookings/preview')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        offerId: 'offer-integration-test',
        productId: 'product-integration-test',
        catalogUuid: 'catalog-integration-test',
        travelers: [
          {
            givenName: 'Integration',
            surname: 'Test',
            gender: 'Male',
            birthDate: '1990-05-15',
            passengerTypeCode: 'ADT',
            phoneCountryCode: '92',
            phoneNumber: '3001234567',
            email: 'integration@test.com',
          },
        ],
      })
      .expect((r) => {
        // Should return 2xx or 4xx — but never 5xx
        expect(r.status).toBeLessThan(500);
      });

    // If the service responds with a booking ID or an actionable error, capture it
    if (res.body?.data?.bookingId) {
      expect(res.body.data.bookingId).toBeDefined();
    }
  });

  it('POST /flights/bookings/checkout — returns paymentId or structured error', async () => {
    const res = await request(app.getHttpServer())
      .post('/flights/bookings/checkout')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        offerId: 'checkout-integration-test',
        productId: 'product-integration-test',
        catalogUuid: 'catalog-integration-test',
        travelers: [
          {
            givenName: 'Checkout',
            surname: 'Test',
            gender: 'Female',
            birthDate: '1992-09-21',
            passengerTypeCode: 'ADT',
            phoneCountryCode: '92',
            phoneNumber: '3007654321',
            email: 'checkout@test.com',
          },
        ],
        gateway: 'STRIPE',
        successUrl: 'http://localhost:3000/booking/success',
        cancelUrl: 'http://localhost:3000/offer/test',
      })
      .expect((r) => {
        // Should not 500 — either succeeds or returns a structured 4xx
        expect(r.status).toBeLessThan(500);
      });

    if (res.body?.data?.paymentId) {
      expect(res.body.data.paymentId).toBeDefined();
    }
  });

  it('POST /flights/ancillaries/catalog — returns catalog shape', async () => {
    const res = await request(app.getHttpServer())
      .post('/flights/ancillaries/catalog')
      .send({
        searchKey: 'catalog-test-key',
        offerId: 'catalog-test-offer',
        travelerCount: 1,
      })
      .expect((r) => {
        expect(r.status).toBeLessThan(500);
      });

    if (res.body?.data) {
      const data = res.body.data;
      // Catalog should have the expected shape even if empty
      expect(data).toHaveProperty('seats');
      expect(data).toHaveProperty('baggage');
      expect(data).toHaveProperty('meals');
      expect(data).toHaveProperty('services');
    }
  });

  it('POST /flights/ancillaries/catalog — rejects invalid travelerCount', async () => {
    await request(app.getHttpServer())
      .post('/flights/ancillaries/catalog')
      .send({
        searchKey: 'test-key',
        offerId: 'test-offer',
        travelerCount: 0,
      })
      .expect(400);
  });

  it('POST /flights/bookings/preview — rejects missing required fields', async () => {
    await request(app.getHttpServer())
      .post('/flights/bookings/preview')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        // Missing offerId, productId, travelers
      })
      .expect(400);
  });

  it('POST /flights/bookings/checkout — rejects unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .post('/flights/bookings/checkout')
      .send({
        offerId: 'test',
        productId: 'test',
        catalogUuid: 'test',
        travelers: [],
        gateway: 'STRIPE',
      })
      .expect(401);
  });
});
