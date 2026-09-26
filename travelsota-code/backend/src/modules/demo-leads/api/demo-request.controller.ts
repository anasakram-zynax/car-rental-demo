import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { type Response } from 'express';
import { DemoLeadsService } from '../application/demo-leads.service';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SubmitDemoRequestDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;
}

@Controller('public/demo-request')
export class DemoRequestController {
  constructor(private readonly service: DemoLeadsService) {}

  @Post()
  async submit(@Body() dto: SubmitDemoRequestDto, @Ip() ipAddress: string) {
    return this.service.submitDemoRequest({
      email: dto.email,
      name: dto.name,
      companyName: dto.companyName,
      whatsappNumber: dto.whatsappNumber,
      ipAddress,
    });
  }

  @Get('credentials/:requestId')
  async getCredentials(@Param('requestId') requestId: string) {
    return this.service.getCredentialsByRequestId(requestId);
  }

  @Get('confirm')
  async confirm(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send(
          '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;"><p style="font-size:20px;color:#ef4444;font-weight:600;">Missing confirmation token.</p></body></html>',
        );
    }
    const result = await this.service.confirmLeadEmail(token);
    const msg =
      result === 'confirmed'
        ? '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;"><div style="text-align:center;padding:32px;max-width:400px;"><p style="font-size:48px;margin:0 0 16px;">&#x2705;</p><h1 style="margin:0 0 8px;font-size:24px;color:#1e293b;font-weight:700;">Email Confirmed!</h1><p style="margin:0;font-size:14px;color:#64748b;">Your email has been confirmed. We may reach out soon.</p></div></body></html>'
        : '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;"><p style="font-size:20px;color:#64748b;">Confirmation token not found.</p></body></html>';
    return res
      .status(result === 'confirmed' ? HttpStatus.OK : HttpStatus.NOT_FOUND)
      .send(msg);
  }
}
