import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Flight Public Booking APIs (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
  });

  it('preview creates booking id', async () => {
    const res = await request(app.getHttpServer())
      .post('/flights/bookings/preview')
      .send({
        offerId: 'offer-test',
        productId: 'product-test',
        catalogUuid: 'catalog-test',
        travelers: [
          {
            givenName: 'A',
            surname: 'B',
            gender: 'Male',
            birthDate: '1990-05-15',
            passengerTypeCode: 'ADT',
            phoneCountryCode: '92',
            phoneNumber: '3001234567',
            email: 'test@example.com',
          },
        ],
      })
      .expect((r) => expect(r.status).toBeLessThan(500));

    expect(res.body?.data?.bookingId).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });
});
