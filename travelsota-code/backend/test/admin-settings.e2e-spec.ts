import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Admin Settings (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();

    const jwtService = app.get(JwtService);
    adminToken = jwtService.sign({
      sub: '00000000-0000-0000-0000-000000000000',
      email: 'admin@test.com',
      role: 'admin',
    });
  });

  it('GET modules requires admin token', async () => {
    await request(app.getHttpServer()).get('/admin/settings/modules').expect(401);
    await request(app.getHttpServer())
      .get('/admin/settings/modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect((res) => {
        expect(res.status).toBeLessThan(500);
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
