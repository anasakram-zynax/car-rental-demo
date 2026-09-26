export interface DemoRuntimeConfig {
  /** Master switch for demo-session behavior (override redirects/merges). */
  enabled: boolean;
  adminEmail: string;
  adminPassword: string;
  agentEmail: string;
  agentPassword: string;
  userEmail: string;
  userPassword: string;
  notificationEmail: string;
  frontendBaseUrl: string;
  resetEnabled: boolean;
  resetIntervalHours: number;
  resetIntervalMinutes: number;
  credentialResetMinutes: number;
  allowPublicSignup: boolean;
  demoModeEmails: string;
}
