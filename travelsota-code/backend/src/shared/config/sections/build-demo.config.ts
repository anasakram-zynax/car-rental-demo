import type { DemoRuntimeConfig } from './demo.config';
import { getBoolean, getNumber, getString } from '../env.utils';

export function buildDemoConfig(env: NodeJS.ProcessEnv): DemoRuntimeConfig {
  return {
    enabled: getBoolean(env, 'DEMO_MODE_ENABLED', false),
    adminEmail: getString(env, 'DEMO_ADMIN_EMAIL', 'admin@travelsota.com') ?? 'admin@travelsota.com',
    adminPassword: getString(env, 'DEMO_ADMIN_PASSWORD', 'demoadmin') ?? 'demoadmin',
    agentEmail: getString(env, 'DEMO_AGENT_EMAIL', 'agent@travelsota.com') ?? 'agent@travelsota.com',
    agentPassword: getString(env, 'DEMO_AGENT_PASSWORD', 'demoagent') ?? 'demoagent',
    userEmail: getString(env, 'DEMO_USER_EMAIL', 'customer@travelsota.com') ?? 'customer@travelsota.com',
    userPassword: getString(env, 'DEMO_USER_PASSWORD', 'democustomer') ?? 'democustomer',
    notificationEmail: getString(env, 'DEMO_NOTIFICATION_EMAIL', 'team@travelsota.com') ?? 'team@travelsota.com',
    frontendBaseUrl: getString(env, 'FRONTEND_BASE_URL', 'http://localhost:3000') ?? 'http://localhost:3000',
    resetEnabled: getBoolean(env, 'DEMO_RESET_ENABLED', false),
    resetIntervalHours: getNumber(env, 'DEMO_RESET_INTERVAL_HOURS', 4),
    resetIntervalMinutes: getNumber(env, 'DEMO_RESET_INTERVAL_MINUTES', 0),
    credentialResetMinutes: getNumber(env, 'DEMO_CREDENTIAL_RESET_MINUTES', 0),
    allowPublicSignup: getBoolean(env, 'ALLOW_PUBLIC_SIGNUP', true),
    demoModeEmails: getString(env, 'DEMO_MODE_EMAILS', '') ?? '',
  };
}
