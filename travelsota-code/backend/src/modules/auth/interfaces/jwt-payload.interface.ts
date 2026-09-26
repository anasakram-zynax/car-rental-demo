export interface JwtPayload {
  sub: string;
  email: string;
  role: string | null;
  userType: string;
  /** Bumped on credential reset — invalidates older JWTs */
  credentialsVersion?: number;
  /** Added automatically by jwt.sign() — not needed in sign payload */
  iat?: number;
}
