declare namespace Express {
  export interface SecurityDiagnostics {
    reasonCode?: string;
    authPassed?: boolean;
    authorizationPassed?: boolean;
    rateLimitExceeded?: boolean;
    rateLimitTier?: string;
    rateLimitKeyHash?: string;
    rateLimitRemaining?: number;
    rateLimitResetAt?: string;
  }

  export interface Request {
    requestId?: string;
    authError?: string;
    securityDiagnostics?: SecurityDiagnostics;
  }
}