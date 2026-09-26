import { createHash } from 'crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggingConfig } from '../logging/logging.config';

const SENSITIVE_KEYS = new Set<string>(LoggingConfig.sensitiveKeys);

function hashForLog(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function ipCategory(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return 'unknown';
  if (value.includes(':')) return 'ipv6';
  if (/^\\d{1,3}(?:\\.\\d{1,3}){3}$/.test(value)) return 'ipv4';
  return 'other';
}

function forbiddenReason(statusCode: number, code: string | undefined, message: string): string | undefined {
  if (statusCode !== HttpStatus.FORBIDDEN) return code;
  if (code) return code;
  const normalized = message.toLowerCase();
  if (normalized.includes('permission')) return 'AUTH_ROLE_REQUIRED';
  if (normalized.includes('origin')) return 'AUTH_ORIGIN_REJECTED';
  if (normalized.includes('agent')) return 'AUTH_ROLE_REQUIRED';
  return 'UNKNOWN_FORBIDDEN';
}

function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactSensitive(v, depth + 1));
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSensitive(value, depth + 1);
      }
    }
    return result;
  }
  return obj;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const timestamp = new Date().toISOString();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error.';
    let code: string | undefined;
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse && typeof exceptionResponse === 'object') {
        const responseObject = exceptionResponse as Record<string, unknown>;

        if (typeof responseObject.code === 'string') {
          code = responseObject.code;
        }

        const responseMessage = responseObject.message;
        if (Array.isArray(responseMessage)) {
          message = responseMessage.join(', ');
        } else if (typeof responseMessage === 'string') {
          message = responseMessage;
        }

        const {
          message: _message,
          statusCode: _statusCode,
          code: _code,
          ...rest
        } = responseObject;
        details = Object.keys(rest).length > 0 ? rest : undefined;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorForLog =
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : exception;

    // Silently ignore cache-optimizer pings and crawler noise (LSCWP etc.)
    const url = request.originalUrl ?? '';
    const isCrawlerNoise =
      url.includes('LSCWP_CTRL') ||
      url.includes('nocache=') ||
      url.includes('before_optm') ||
      url.includes('wp-json') ||
      url.includes('.php');
    if (isCrawlerNoise && statusCode === 404) {
      response.status(200).json({ ok: true });
      return;
    }

    const user = (request as unknown as { user?: { id?: string } }).user;
    const securityDiagnostics = request.securityDiagnostics ?? {};
    const reasonCode = forbiddenReason(statusCode, code, message);
    const securityLog = {
      timestamp,
      requestId: request.requestId ?? null,
      method: request.method,
      route: request.originalUrl ?? request.url,
      reasonCode: reasonCode ?? code ?? (statusCode >= 400 ? 'UNKNOWN_ERROR' : undefined),
      authPassed: Boolean(user),
      authorizationPassed: statusCode < HttpStatus.FORBIDDEN,
      rateLimitExceeded: securityDiagnostics.rateLimitExceeded ?? code === 'RATE_LIMIT_EXCEEDED',
      rateLimitTier: securityDiagnostics.rateLimitTier ?? null,
      rateLimitKeyHash: securityDiagnostics.rateLimitKeyHash ?? null,
      rateLimitRemaining: securityDiagnostics.rateLimitRemaining ?? null,
      rateLimitResetAt: securityDiagnostics.rateLimitResetAt ?? null,
      clientIpCategory: ipCategory(request.ip),
      userIdHash: hashForLog(user?.id),
      host: request.get('host') ?? null,
      origin: request.get('origin') ?? null,
      isRsc: typeof request.query?._rsc === 'string' || request.originalUrl?.includes('_rsc=') === true,
      authError: request.authError ?? null,
    };

    const extra = {
      security: securityLog,
      details,
      requestBody: redactSensitive(request.body),
    };

    this.logger.error(
      `${request.method} ${request.originalUrl} -> ${statusCode} ${reasonCode ?? message}`,
      `${String(errorForLog)} ${JSON.stringify(extra)}`,
    );

    response.status(statusCode).json({
      success: false,
      statusCode,
      ...(code ? { code } : {}),
      message,
      timestamp,
      path: request.originalUrl,
      requestId: (request as unknown as Record<string, unknown>).requestId ?? null,
      ...(details !== undefined ? { error: details } : {}),
    });
  }
}
