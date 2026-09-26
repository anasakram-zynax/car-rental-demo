import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AppConfigService } from '../../../shared/config/app-config.service';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import type { PaymentStatus, PromoCodeStatus } from '../../../generated';
import * as bcrypt from 'bcrypt';

/** Always-visible diagnostics. NestJS Logger is filtered by LOG_LEVEL (e.g. 'error'),
 *  which silently hides reset logs on some hosts. console.log bypasses that. */
function dbg(msg: string): void {
  console.log(`[DemoReset] ${msg}`);
}

/** Tables truncated during demo reset — transient demo activity ONLY, never config/reference data */
const RESET_TABLES = [
  'FlightBooking',
  'FlightBookingExtra',
  'FlightOfferSnapshot',
  'HotelBooking',
  'Payment',
  'OutboxEvent',
  'RefreshToken',
  'AuditLog',
  'Notification',
  'NotificationRecipient',
  'EmailMessage',
  'EmailRecipient',
  'EmailDeliveryAttempt',
  'WalletTransaction',
  'WalletHold',
  'CreditShell',
  'CommissionRecord',
  'BookingModificationRequest',
  'PromoRedemption',
  'PromoAuditLog',
  'SupplierWebhookEvent',
  'BlogCategory',
  'BlogPost',
  'CmsPage',
  'CmsMenu',
  'DemoCredential',
  'DemoConfigOverride',
  'MarkupRule',
  'CommissionRule',
  'CancellationFeeRule',
];

const ALL_PERMISSION_CODES: Array<{
  code: string;
  name: string;
  group: string;
}> = [
  {
    code: PermissionCode.BOOKINGS_READ,
    name: 'View Bookings',
    group: 'bookings',
  },
  {
    code: PermissionCode.BOOKINGS_WRITE,
    name: 'Manage Bookings',
    group: 'bookings',
  },
  {
    code: PermissionCode.BOOKINGS_CANCEL,
    name: 'Cancel Bookings',
    group: 'bookings',
  },
  {
    code: PermissionCode.BOOKINGS_REFUND,
    name: 'Refund Bookings',
    group: 'bookings',
  },
  { code: PermissionCode.USERS_READ, name: 'View Users', group: 'users' },
  { code: PermissionCode.USERS_WRITE, name: 'Manage Users', group: 'users' },
  { code: PermissionCode.USERS_DELETE, name: 'Delete Users', group: 'users' },
  {
    code: PermissionCode.USERS_MANAGE_ROLES,
    name: 'Manage Roles',
    group: 'users',
  },
  { code: PermissionCode.AGENTS_READ, name: 'View Agents', group: 'users' },
  { code: PermissionCode.AGENTS_WRITE, name: 'Manage Agents', group: 'users' },
  {
    code: PermissionCode.AGENTS_SET_CREDIT,
    name: 'Set Agent Credit',
    group: 'users',
  },
  {
    code: PermissionCode.AGENTS_SET_COMMISSION,
    name: 'Set Agent Commission',
    group: 'users',
  },
  {
    code: PermissionCode.AGENTS_APPROVE,
    name: 'Approve Agents',
    group: 'users',
  },
  {
    code: PermissionCode.REPORTS_READ,
    name: 'View Reports',
    group: 'dashboard',
  },
  {
    code: PermissionCode.REPORTS_EXPORT,
    name: 'Export Reports',
    group: 'dashboard',
  },
  { code: PermissionCode.AUDIT_READ, name: 'View Audit Logs', group: 'audit' },
  {
    code: PermissionCode.AUDIT_EXPORT,
    name: 'Export Audit Logs',
    group: 'audit',
  },
  {
    code: PermissionCode.SETTINGS_READ,
    name: 'View Settings',
    group: 'settings',
  },
  {
    code: PermissionCode.SETTINGS_WRITE,
    name: 'Manage Settings',
    group: 'settings',
  },
  {
    code: PermissionCode.SETTINGS_MANAGE_MODULES,
    name: 'Manage Modules',
    group: 'settings',
  },
  {
    code: PermissionCode.SETTINGS_MANAGE_PAYMENTS,
    name: 'Manage Payments',
    group: 'settings',
  },
  {
    code: PermissionCode.SETTINGS_MANAGE_CURRENCIES,
    name: 'Manage Currencies',
    group: 'settings',
  },
  {
    code: PermissionCode.SETTINGS_MANAGE_LANGUAGES,
    name: 'Manage Languages',
    group: 'settings',
  },
  {
    code: PermissionCode.SETTINGS_UPDATE_RATES,
    name: 'Update Rates',
    group: 'settings',
  },
  {
    code: PermissionCode.INVOICES_READ,
    name: 'View Invoices',
    group: 'invoices',
  },
  {
    code: PermissionCode.INVOICES_MANAGE,
    name: 'Manage Invoices',
    group: 'invoices',
  },
  {
    code: PermissionCode.INVOICES_EXPORT,
    name: 'Export Invoices',
    group: 'invoices',
  },
  {
    code: PermissionCode.INVOICES_TEMPLATES_MANAGE,
    name: 'Manage Templates',
    group: 'invoices',
  },
  {
    code: PermissionCode.CREDIT_NOTES_CREATE,
    name: 'Create Credit Notes',
    group: 'invoices',
  },
  {
    code: PermissionCode.PROMO_CODES_READ,
    name: 'View Promo Codes',
    group: 'promo_codes',
  },
  {
    code: PermissionCode.PROMO_CODES_CREATE,
    name: 'Create Promo Codes',
    group: 'promo_codes',
  },
  {
    code: PermissionCode.PROMO_CODES_UPDATE,
    name: 'Update Promo Codes',
    group: 'promo_codes',
  },
  {
    code: PermissionCode.PROMO_CODES_DELETE,
    name: 'Delete Promo Codes',
    group: 'promo_codes',
  },
  {
    code: PermissionCode.CUSTOMER_MARKUP_READ,
    name: 'View Customer Markups',
    group: 'customer_markups',
  },
  {
    code: PermissionCode.CUSTOMER_MARKUP_WRITE,
    name: 'Manage Customer Markups',
    group: 'customer_markups',
  },
  {
    code: PermissionCode.NOTIFICATIONS_READ,
    name: 'View Notifications',
    group: 'notifications',
  },
  {
    code: PermissionCode.NOTIFICATIONS_MANAGE,
    name: 'Manage Notifications',
    group: 'notifications',
  },
  {
    code: PermissionCode.NOTIFICATIONS_ASSIGN,
    name: 'Assign Notifications',
    group: 'notifications',
  },
  { code: PermissionCode.EMAILS_READ, name: 'View Emails', group: 'emails' },
  {
    code: PermissionCode.EMAILS_MANAGE,
    name: 'Manage Emails',
    group: 'emails',
  },
  { code: PermissionCode.EMAILS_RETRY, name: 'Retry Emails', group: 'emails' },
  { code: PermissionCode.BLOGS_READ, name: 'View Blogs', group: 'blogs' },
  { code: PermissionCode.BLOGS_WRITE, name: 'Manage Blogs', group: 'blogs' },
  { code: PermissionCode.CMS_READ, name: 'View CMS', group: 'cms' },
  { code: PermissionCode.CMS_WRITE, name: 'Manage CMS', group: 'cms' },
];

@Injectable()
export class DemoResetService implements OnModuleInit {
  private readonly logger = new Logger(DemoResetService.name);
  private lastReset: Date | null = null;
  private resetLogs: string[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit() {
    dbg('=== START ===');

    // Always ensure the real admin account exists — runs first, cannot be skipped
    try {
      await this.ensureRealAdmin();
    } catch (err) {
      dbg(
        `Real admin creation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const rawReset = process.env.DEMO_RESET_ENABLED;
    const rawCrd = process.env.DEMO_CREDENTIAL_RESET_MINUTES;
    const rawRst = process.env.DEMO_RESET_INTERVAL_MINUTES;
    dbg(
      `Env: DEMO_RESET_ENABLED="${rawReset}" CREDENTIAL_MIN="${rawCrd}" INTERVAL_MIN="${rawRst}"`,
    );
    dbg(
      `Parsed: resetEnabled=${this.config.demo.resetEnabled} credentialMinutes=${this.config.demo.credentialResetMinutes} intervalMinutes=${this.config.demo.resetIntervalMinutes}`,
    );

    // Email diagnostics — makes misconfigured notification routing visible at boot
    const fromAddr =
      process.env.EMAIL_FROM ??
      'TravelsOTA <noreply@travelsota.com> (EMAIL_FROM not set, using default)';
    dbg(
      `Email: provider="${process.env.EMAIL_PROVIDER ?? 'mock'}" from="${fromAddr}"`,
    );
    dbg(
      `Email: ADMIN_EMAIL=${process.env.ADMIN_EMAIL ? `set (${process.env.ADMIN_EMAIL})` : 'NOT SET — booking alerts fall back to first non-demo STAFF user'}`,
    );

    let seedErr = '';
    try {
      dbg('ensureDemoAccountsExist starting...');
      await this.ensureDemoAccountsExist();
      dbg('ensureDemoAccountsExist completed');
    } catch (err) {
      seedErr = err instanceof Error ? err.message : String(err);
      dbg(`ensureDemoAccountsExist FAILED: ${seedErr}`);
    }

    if (this.config.demo.resetEnabled) {
      // Defer the first reset — running a heavy TRUNCATE+seed cycle during the
      // startup window competes with first requests and exhausts the PG pool.
      // 90s warm-up delay lets the app stabilize before resetting demo data.
      const intervalMs =
        this.config.demo.resetIntervalMinutes > 0
          ? this.config.demo.resetIntervalMinutes * 60 * 1000
          : this.config.demo.resetIntervalHours * 60 * 60 * 1000;
      dbg(
        `FULL RESET: scheduling every ${intervalMs}ms (${intervalMs / 60000}m)`,
      );
      const id = setInterval(() => {
        dbg('=== FULL RESET FIRED ===');
        this.executeResetWithRetry().catch((err) => {
          dbg(
            `Full reset failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }, intervalMs);
      dbg(
        `FULL RESET: interval ID=${String(id)} first fire at ${new Date(Date.now() + intervalMs).toISOString()}`,
      );
      dbg('FULL RESET: first reset deferred 90s after startup');
      setTimeout(() => {
        this.executeResetWithRetry().catch((err) => {
          dbg(
            `First full reset failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }, 90_000);
    } else {
      dbg('FULL RESET: DISABLED (DEMO_RESET_ENABLED != true)');
    }

    if (this.config.demo.credentialResetMinutes > 0) {
      dbg(`Credential reset DISABLED — using static env credentials`);
    } else {
      dbg(`Credential reset DISABLED`);
    }

    dbg('=== READY ===');
    if (seedErr) dbg(`WARN: seed had error: ${seedErr}`);
  }

  private scheduleCredentialReset() {
    const intervalMs = this.config.demo.credentialResetMinutes * 60 * 1000;
    setInterval(() => {
      this.createDemoAccounts().catch((err) => {
        this.logger.error(
          `Credential reset failed: ${err instanceof Error ? err.message : err}`,
        );
      });
    }, intervalMs);
    this.logger.log(
      `Demo credential reset scheduled every ${this.config.demo.credentialResetMinutes}m`,
    );
  }

  private scheduleReset() {
    const config = this.config.demo;
    const intervalMs =
      config.resetIntervalMinutes > 0
        ? config.resetIntervalMinutes * 60 * 1000
        : config.resetIntervalHours * 60 * 60 * 1000;
    const label =
      config.resetIntervalMinutes > 0
        ? `${config.resetIntervalMinutes}m`
        : `${config.resetIntervalHours}h`;
    setInterval(() => {
      this.executeReset().catch((err) => {
        this.logger.error(
          `Scheduled demo reset failed: ${err instanceof Error ? err.message : err}`,
        );
      });
    }, intervalMs);
    this.logger.log(`Demo reset scheduled every ${label}`);
  }

  async executeResetWithRetry() {
    try {
      await this.executeReset();
    } catch (err) {
      this.logger.warn(
        `Demo reset first attempt failed (${err instanceof Error ? err.message : String(err)}) — retrying once in 15s`,
      );
      await new Promise((r) => setTimeout(r, 15_000));
      await this.executeReset();
    }
  }

  async executeReset() {
    dbg('Starting demo reset (transient data only)...');
    const start = Date.now();

    try {
      for (const table of RESET_TABLES) {
        try {
          await this.prisma.$executeRawUnsafe(
            `TRUNCATE TABLE "public"."${table}" CASCADE`,
          );
        } catch (err) {
          this.logger.warn(
            `Failed to truncate "${table}": ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      this.addLog('Transient data truncated — reseeding demo data');
      await this.seedAllData();
      this.addLog('Seed data complete');
      await this.createDemoAccounts();
      this.addLog('Demo accounts restored');
    } catch (err) {
      this.addLog(
        `Reset failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.logger.error(
        `Reset failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }

    this.lastReset = new Date();
    const elapsed = Date.now() - start;
    this.addLog(`Reset completed in ${elapsed}ms`);
    dbg(`Demo reset completed in ${elapsed}ms`);
  }

  private async seedAllData() {
    await this.seedPermissions();
    const permissions = await this.prisma.permission.findMany();
    const codes = new Set(permissions.map((p) => p.code));

    const perm = (key: string) => {
      const p = permissions.find((x) => x.code === key);
      if (!p) throw new Error(`Permission missing: ${key}`);
      return p.id;
    };

    // ── super_admin ──
    const superAdmin = await this.upsertRole(
      'super_admin',
      'Full system access',
      true,
      100,
    );
    for (const p of permissions) {
      await this.upsertRolePermission(superAdmin.id, p.id);
    }

    // ── admin ──
    const admin = await this.upsertRole(
      'admin',
      'Administrative access',
      true,
      90,
    );
    for (const p of permissions) {
      await this.upsertRolePermission(admin.id, p.id);
    }

    // ── manager ──
    const manager = await this.upsertRole(
      'manager',
      'Operations manager',
      false,
      80,
    );
    const managerCodes = [
      PermissionCode.REPORTS_READ,
      PermissionCode.REPORTS_EXPORT,
      PermissionCode.USERS_READ,
      PermissionCode.USERS_WRITE,
      PermissionCode.BOOKINGS_READ,
      PermissionCode.BOOKINGS_WRITE,
      PermissionCode.BOOKINGS_CANCEL,
      PermissionCode.AGENTS_READ,
      PermissionCode.AGENTS_WRITE,
      PermissionCode.SETTINGS_READ,
      PermissionCode.CUSTOMER_MARKUP_READ,
      PermissionCode.CUSTOMER_MARKUP_WRITE,
      PermissionCode.PROMO_CODES_READ,
      PermissionCode.PROMO_CODES_CREATE,
      PermissionCode.PROMO_CODES_UPDATE,
    ];
    for (const code of managerCodes) {
      if (codes.has(code))
        await this.upsertRolePermission(manager.id, perm(code));
    }

    // ── basic_agent ──
    const basicAgent = await this.upsertRole(
      'basic_agent',
      'Basic agent',
      false,
      60,
    );
    for (const code of [
      PermissionCode.AGENT_BOOK_FLIGHTS,
      PermissionCode.AGENT_BOOK_HOTELS,
      PermissionCode.AGENT_VIEW_OWN_BOOKINGS,
    ]) {
      if (codes.has(code))
        await this.upsertRolePermission(basicAgent.id, perm(code));
    }

    // ── premium_agent ──
    const premiumAgent = await this.upsertRole(
      'premium_agent',
      'Premium agent',
      false,
      70,
    );
    for (const code of [
      PermissionCode.AGENT_BOOK_FLIGHTS,
      PermissionCode.AGENT_BOOK_HOTELS,
      PermissionCode.AGENT_VIEW_OWN_BOOKINGS,
      PermissionCode.AGENT_VIEW_REPORTS,
      PermissionCode.AGENT_VIEW_COMMISSION,
      PermissionCode.AGENT_USE_WALLET,
      PermissionCode.AGENT_MANAGE_CUSTOMERS,
    ]) {
      if (codes.has(code))
        await this.upsertRolePermission(premiumAgent.id, perm(code));
    }

    // ── corporate_agent ──
    const corpAgent = await this.upsertRole(
      'corporate_agent',
      'Corporate agent',
      false,
      75,
    );
    for (const code of [
      PermissionCode.AGENT_BOOK_FLIGHTS,
      PermissionCode.AGENT_BOOK_HOTELS,
      PermissionCode.AGENT_VIEW_OWN_BOOKINGS,
      PermissionCode.AGENT_CANCEL_BOOKINGS,
      PermissionCode.AGENT_MODIFY_BOOKINGS,
      PermissionCode.AGENT_VIEW_REPORTS,
      PermissionCode.AGENT_EXPORT_REPORTS,
      PermissionCode.AGENT_VIEW_COMMISSION,
      PermissionCode.AGENT_USE_WALLET,
      PermissionCode.AGENT_MANAGE_CUSTOMERS,
      PermissionCode.AGENT_VIEW_PRICING,
      PermissionCode.AGENT_MANAGE_SUB_AGENTS,
      PermissionCode.AGENT_ACCESS_INSIGHTS,
    ]) {
      if (codes.has(code))
        await this.upsertRolePermission(corpAgent.id, perm(code));
    }

    // ── sub_agent ──
    const subAgent = await this.upsertRole('sub_agent', 'Sub-agent', true, 50);
    for (const code of [
      PermissionCode.AGENT_BOOK_FLIGHTS,
      PermissionCode.AGENT_BOOK_HOTELS,
      PermissionCode.AGENT_VIEW_OWN_BOOKINGS,
    ]) {
      if (codes.has(code))
        await this.upsertRolePermission(subAgent.id, perm(code));
    }

    dbg(`Seeded ${permissions.length} permissions + 7 roles`);

    // ── Dashboard demo data ──
    await this.seedDashboardData();
  }

  private async seedPermissions() {
    for (const perm of ALL_PERMISSION_CODES) {
      await this.prisma.permission.upsert({
        where: { code: perm.code },
        create: perm,
        update: {},
      });
    }
  }

  private async upsertRole(
    name: string,
    description: string,
    isProtected: boolean,
    priority: number,
  ) {
    return this.prisma.role.upsert({
      where: { name },
      create: { name, description, isProtected, priority },
      update: { description, priority },
    });
  }

  private async upsertRolePermission(roleId: string, permissionId: string) {
    await this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      create: { roleId, permissionId },
      update: {},
    });
  }

  private async seedDashboardData() {
    const superAdminRole = await this.prisma.role.findUnique({
      where: { name: 'super_admin' },
    });
    if (!superAdminRole) {
      this.logger.warn('super_admin role not found — skipping dashboard seed');
      return;
    }

    const now = Date.now();
    const DAY = 86400000;
    const MONTH_DAYS = 30;
    const MONTHS_BACK = 4;

    // Spread dates across 4 months. More bookings in recent months, fewer in earlier.
    // Month -4: 15%, Month -3: 20%, Month -2: 25%, Month -1: 40%
    function randomDate(monthWeight?: number): Date {
      let monthOffset: number;
      if (monthWeight !== undefined) {
        monthOffset = monthWeight;
      } else {
        const r = Math.random();
        if (r < 0.4) monthOffset = 1;
        else if (r < 0.65) monthOffset = 2;
        else if (r < 0.85) monthOffset = 3;
        else monthOffset = 4;
      }
      const baseMs = now - monthOffset * MONTH_DAYS * DAY;
      const jitter = Math.floor(Math.random() * MONTH_DAYS * DAY);
      return new Date(baseMs + jitter);
    }

    const firstNamePool = [
      'Ahmed',
      'Fatima',
      'Omar',
      'Aisha',
      'Bilal',
      'Zainab',
      'Hassan',
      'Maryam',
      'Tariq',
      'Nadia',
      'Kamran',
      'Sana',
      'Usman',
      'Hira',
      'Faisal',
      'Amna',
      'Rashid',
      'Lubna',
      'Imran',
      'Sadia',
      'Waqas',
      'Farah',
      'Nasir',
      'Kiran',
    ];
    const lastNamePool = [
      'Khan',
      'Malik',
      'Sheikh',
      'Qureshi',
      'Ahmed',
      'Hassan',
      'Ali',
      'Butt',
      'Chaudhry',
      'Siddiqui',
      'Iqbal',
      'Mirza',
      'Syed',
      'Raja',
      'Awan',
      'Javed',
    ];

    const customers: Array<{ id: string; email: string }> = [];
    for (let i = 1; i <= 25; i++) {
      const email = `customer${i}@example.com`;
      const hash = await bcrypt.hash('password123', 12);
      const fn =
        firstNamePool[Math.floor(Math.random() * firstNamePool.length)];
      const ln = lastNamePool[Math.floor(Math.random() * lastNamePool.length)];
      const user = await this.prisma.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash: hash,
          firstName: fn,
          lastName: ln,
          userType: 'CUSTOMER',
          status: 'ACTIVE',
          emailVerified: true,
          phone: `+92 3${String(10000000 + Math.floor(Math.random() * 90000000)).slice(2)}`,
        },
        update: {
          passwordHash: hash,
          firstName: fn,
          lastName: ln,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      customers.push({ id: user.id, email });
    }

    // ── Flight routes with realistic data ──
    const flightRoutes: Array<{
      origin: string;
      dest: string;
      originCity: string;
      destCity: string;
      airline: string;
      flightNumber: string;
      duration: string;
      basePrice: number;
    }> = [
      {
        origin: 'DXB',
        dest: 'LHR',
        originCity: 'Dubai',
        destCity: 'London',
        airline: 'EK',
        flightNumber: 'EK001',
        duration: '7h 15m',
        basePrice: 850,
      },
      {
        origin: 'KHI',
        dest: 'JED',
        originCity: 'Karachi',
        destCity: 'Jeddah',
        airline: 'SV',
        flightNumber: 'SV701',
        duration: '4h 30m',
        basePrice: 620,
      },
      {
        origin: 'ISB',
        dest: 'LHR',
        originCity: 'Islamabad',
        destCity: 'London',
        airline: 'PK',
        flightNumber: 'PK785',
        duration: '8h 10m',
        basePrice: 780,
      },
      {
        origin: 'LHE',
        dest: 'DXB',
        originCity: 'Lahore',
        destCity: 'Dubai',
        airline: 'EK',
        flightNumber: 'EK623',
        duration: '3h 25m',
        basePrice: 420,
      },
      {
        origin: 'JFK',
        dest: 'DXB',
        originCity: 'New York',
        destCity: 'Dubai',
        airline: 'EK',
        flightNumber: 'EK202',
        duration: '12h 50m',
        basePrice: 1250,
      },
      {
        origin: 'DXB',
        dest: 'IST',
        originCity: 'Dubai',
        destCity: 'Istanbul',
        airline: 'TK',
        flightNumber: 'TK761',
        duration: '4h 45m',
        basePrice: 560,
      },
      {
        origin: 'KHI',
        dest: 'DXB',
        originCity: 'Karachi',
        destCity: 'Dubai',
        airline: 'PK',
        flightNumber: 'PK213',
        duration: '2h 15m',
        basePrice: 320,
      },
      {
        origin: 'LHE',
        dest: 'KHI',
        originCity: 'Lahore',
        destCity: 'Karachi',
        airline: 'PK',
        flightNumber: 'PK304',
        duration: '1h 55m',
        basePrice: 180,
      },
      {
        origin: 'ISB',
        dest: 'JED',
        originCity: 'Islamabad',
        destCity: 'Jeddah',
        airline: 'SV',
        flightNumber: 'SV723',
        duration: '5h 10m',
        basePrice: 580,
      },
      {
        origin: 'DXB',
        dest: 'BKK',
        originCity: 'Dubai',
        destCity: 'Bangkok',
        airline: 'EK',
        flightNumber: 'EK370',
        duration: '6h 20m',
        basePrice: 710,
      },
    ];
    const cabins = ['Economy', 'Economy', 'Economy', 'Business', 'First'];

    // Seed 50 flight bookings spread across 4 months
    for (let i = 1; i <= 50; i++) {
      const route =
        flightRoutes[Math.floor(Math.random() * flightRoutes.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const cabin = cabins[Math.floor(Math.random() * cabins.length)];
      const cabinMultiplier =
        cabin === 'Business' ? 2.5 : cabin === 'First' ? 5 : 1;
      const amount = Math.round(
        route.basePrice * cabinMultiplier * (0.85 + Math.random() * 0.4),
      );
      const createdDate = randomDate();

      const statusRoll = Math.random();
      let status: string;
      let locatorCode: string | null = null;
      if (statusRoll < 0.65) {
        status = 'booked';
        locatorCode = `${route.airline}${String(Math.random()).slice(2, 8).toUpperCase()}`;
      } else if (statusRoll < 0.85) status = 'pending_payment';
      else if (statusRoll < 0.95) status = 'cancelled';
      else status = 'failed';

      const booking = await this.prisma.flightBooking.create({
        data: {
          provider: 'travelport',
          status,
          offerSnapshot: {
            origin: route.origin,
            destination: route.dest,
            originCity: route.originCity,
            destCity: route.destCity,
            airline: route.airline,
            flightNumber: route.flightNumber,
            duration: route.duration,
            cabinClass: cabin,
          },
          travelerSnapshot: {
            travelers: [
              {
                firstName: customer.email.split('@')[0].replace(/[0-9]/g, ''),
                lastName: 'Traveler',
              },
            ],
          },
          amount,
          currency: 'USD',
          userId: customer.id,
          locatorCode,
          createdAt: createdDate,
        },
      });

      // Payment — varied statuses
      if (
        status === 'booked' ||
        status === 'cancelled' ||
        status === 'failed'
      ) {
        const payRoll = Math.random();
        let payStatus: string;
        if (payRoll < 0.7) payStatus = 'PAID';
        else if (payRoll < 0.8) payStatus = 'PENDING';
        else if (payRoll < 0.9) payStatus = 'REFUNDED';
        else payStatus = 'FAILED';

        await this.prisma.payment.create({
          data: {
            reference: `PAY-FLT-${booking.id.slice(0, 8)}`,
            bookingId: booking.id,
            bookingType: 'FLIGHT',
            gateway: Math.random() < 0.55 ? 'stripe' : 'paypal',
            amount: amount + Math.round(amount * 0.08),
            currency: 'USD',
            status: payStatus as PaymentStatus,
            idempotencyKey: `seed-flt-${i}`,
            providerPaymentId: `pi_${booking.id.slice(0, 14)}`,
            createdAt: createdDate,
          },
        });
      }
    }

    // ── Hotel bookings spread across months ──
    // Images served locally from /images/hotels/ (vision-verified, no CDN dependency)
    const hotelList: Array<{
      name: string;
      location: string;
      stars: number;
      basePrice: number;
      image: string;
    }> = [
      {
        name: 'Burj Al Arab Jumeirah',
        location: 'Dubai, UAE',
        stars: 5,
        basePrice: 1200,
        image: '/images/hotels/261187.jpg',
      },
      {
        name: 'Atlantis The Palm',
        location: 'Dubai, UAE',
        stars: 5,
        basePrice: 850,
        image: '/images/hotels/78126.jpg',
      },
      {
        name: 'Ritz-Carlton DIFC',
        location: 'Dubai, UAE',
        stars: 5,
        basePrice: 650,
        image: '/images/hotels/1001965.jpg',
      },
      {
        name: 'Pearl Continental Karachi',
        location: 'Karachi, Pakistan',
        stars: 5,
        basePrice: 220,
        image: '/images/hotels/271624.jpg',
      },
      {
        name: 'Serena Hotel Islamabad',
        location: 'Islamabad, Pakistan',
        stars: 5,
        basePrice: 280,
        image: '/images/hotels/1134176.jpg',
      },
      {
        name: 'Avari Hotel Lahore',
        location: 'Lahore, Pakistan',
        stars: 4,
        basePrice: 160,
        image: '/images/hotels/261169.jpg',
      },
      {
        name: 'Movenpick Jeddah',
        location: 'Jeddah, Saudi Arabia',
        stars: 5,
        basePrice: 480,
        image: '/images/hotels/2034335.jpg',
      },
      {
        name: 'Hilton Istanbul Bosphorus',
        location: 'Istanbul, Turkey',
        stars: 5,
        basePrice: 380,
        image: '/images/hotels/2096983.jpg',
      },
      {
        name: 'Marina Bay Sands',
        location: 'Singapore',
        stars: 5,
        basePrice: 720,
        image: '/images/hotels/1268855.jpg',
      },
      {
        name: 'Taj Mahal Palace Mumbai',
        location: 'Mumbai, India',
        stars: 5,
        basePrice: 350,
        image: '/images/hotels/2119714.jpg',
      },
    ];

    for (let i = 1; i <= 30; i++) {
      const hotel = hotelList[Math.floor(Math.random() * hotelList.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const nights = 1 + Math.floor(Math.random() * 7);
      const amount = Math.round(
        hotel.basePrice * nights * (0.8 + Math.random() * 0.5),
      );
      const createdDate = randomDate();

      const statusRoll = Math.random();
      let status: string;
      let hbRef: string | null = null;
      if (statusRoll < 0.6) {
        status = 'booked';
        hbRef = `HB-${String(i).padStart(6, '0')}`;
      } else if (statusRoll < 0.8) status = 'pending_payment';
      else if (statusRoll < 0.92) status = 'cancelled';
      else status = 'failed';

      const booking = await this.prisma.hotelBooking.create({
        data: {
          provider: 'hotelbeds',
          status,
          rateKey: `RK-${String(i).padStart(4, '0')}`,
          holder: {
            name: customer.email.split('@')[0].replace(/[0-9]/g, ''),
            surname: 'Guest',
          },
          clientReference: `CR-${i}-${Date.now().toString().slice(-4)}`,
          paxes: [
            {
              name: customer.email.split('@')[0].replace(/[0-9]/g, ''),
              surname: 'Guest',
              type: 'AD',
            },
            { name: 'Spouse', surname: 'Guest', type: 'AD' },
          ],
          hotelSnapshot: {
            name: hotel.name,
            stars: hotel.stars,
            location: hotel.location,
            image: hotel.image,
          },
          priceSnapshot: { total: amount, currency: 'USD', nights },
          amount,
          currency: 'USD',
          userId: customer.id,
          hotelbedsRef: hbRef,
          supplierBookingId: hbRef ? `SUP-${String(i).padStart(6, '0')}` : null,
          createdAt: createdDate,
        },
      });

      if (status === 'booked' || status === 'cancelled') {
        const payRoll = Math.random();
        let payStatus: string;
        if (payRoll < 0.65) payStatus = 'PAID';
        else if (payRoll < 0.75) payStatus = 'PENDING';
        else if (payRoll < 0.85) payStatus = 'REFUNDED';
        else payStatus = 'FAILED';

        await this.prisma.payment.create({
          data: {
            reference: `PAY-HTL-${booking.id.slice(0, 8)}`,
            bookingId: booking.id,
            bookingType: 'HOTEL',
            gateway: Math.random() < 0.55 ? 'stripe' : 'paypal',
            amount: amount + Math.round(amount * 0.12),
            currency: 'USD',
            status: payStatus as PaymentStatus,
            idempotencyKey: `seed-htl-${i}`,
            providerPaymentId: `pi_${booking.id.slice(0, 14)}`,
            createdAt: createdDate,
          },
        });
      }
    }

    dbg(
      `Seeded 25 customers + 50 flights + 30 hotels with varied payments across 4 months`,
    );

    // ── Content: Blog + CMS ──
    await this.seedContentData();
  }

  private async seedContentData() {
    const blogCategories = [
      {
        name: 'Travel Tips',
        slug: 'travel-tips',
        description: 'Expert travel advice and hacks',
      },
      {
        name: 'Destinations',
        slug: 'destinations',
        description: 'Explore amazing places around the world',
      },
      {
        name: 'Airlines',
        slug: 'airlines',
        description: 'Airline news and reviews',
      },
      {
        name: 'Hotels',
        slug: 'hotels',
        description: 'Hotel guides and recommendations',
      },
      {
        name: 'Deals',
        slug: 'deals',
        description: 'Latest travel deals and promotions',
      },
    ];
    for (const cat of blogCategories) {
      await this.prisma.blogCategory.upsert({
        where: { slug: cat.slug },
        create: cat,
        update: { name: cat.name, description: cat.description },
      });
    }
    dbg('Seeded blog categories');

    const blogPosts: Array<{
      title: string;
      slug: string;
      excerpt: string;
      categorySlug: string;
      cover: string;
      keywords: string;
      status: 'PUBLISHED' | 'DRAFT';
      featured?: boolean;
      bodyHtml: string;
    }> = [
      {
        title: '10 Airport Mistakes That Cost First-Time Flyers Real Money',
        slug: 'airport-mistakes-first-time-flyers',
        excerpt:
          'From check-in queues to currency exchange traps — here is what actually matters when you are at the airport for the first time.',
        categorySlug: 'travel-tips',
        cover: '/images/blog/airport-mistakes-first-time-flyers.jpg',
        keywords:
          'airport tips, first time flyer, boarding pass, check-in, travel mistakes',
        status: 'PUBLISHED' as const,
        featured: true,
        bodyHtml: `<p>Most first-time flyer advice is noise. "Arrive early." "Pack light." You already know that. The things that actually cost you — money, time, or a missed flight — are rarely on the generic lists.</p>
<h3>1. Your boarding pass is not the same as your ticket</h3><p>Airlines sell tickets. Check-in generates boarding passes. If you booked through a third party and the system errors out at check-in, you have a ticket problem, not a boarding pass problem. Call the travel agent who issued the ticket — the airline counter cannot fix it.</p>
<h3>2. Currency exchange at the airport is a 12-18% loss</h3><p>Airport exchange booths charge spreads that would make a hedge fund blush. If you must exchange cash, do it at a bank in the city before you leave. Better: use a multi-currency card and let the interbank rate do the work.</p>
<h3>3. The app check-in window opens exactly 24-48 hours before departure</h3><p>Carriers release seats and even upgrade inventory when online check-in opens. If you are on a full flight and check in 4 hours before departure, you are getting the middle seat in row 38. Set a reminder.</p>
<h3>4. Gate changes happen without announcements</h3><p>Boarding pass says Gate A12. The display board says A12. But the actual flight is departing from B4. Airlines update their own app before the airport screens. Keep the airline app open, not the airport board.</p>
<h3>5. Your carry-on limit is smaller than you think</h3><p>Most economy carriers enforce a 7 kg limit on cabin baggage. They weigh it at the gate, not at check-in. Over the limit? You pay the excess baggage fee at the gate in cash or card — no exceptions.</p>
<h3>6. Immigration forms need a local address</h3><p>You cannot write "transit" or leave it blank. Have the address of your first hotel ready. If you are transiting through a country that requires a landing card, this is the number one reason people get pulled aside.</p>
<h3>7. Mobile data roaming can cost more than your ticket</h3><p>A single day of data roaming in some countries costs USD 50-100. Buy a local eSIM before you board. Airalo, Holafly, or the carrier's own travel plan — anything is better than default roaming.</p>
<h3>8. Connection times under 60 minutes are gambling</h3><p>Even if the airline sells the itinerary, a 50-minute connection in a large hub (DXB, LHR, IST) means lounges pass silently by while you sprint between terminals. Book minimum 90 minutes.</p>
<h3>9. Seat selection is not optional on budget carriers</h3><p>Many low-cost airlines will auto-assign scattered seats if you skip paid seat selection. If you are traveling with family and do not pay for seats together, the system will place you in different rows — by design.</p>
<h3>10. The cheapest fare class voids upgrades</h3><p>Basic economy and saver fares are not eligible for paid upgrades, mileage upgrades, or even same-day confirmed changes. If you might need flexibility, pay the extra USD 40-80 for standard economy.</p>`,
      },
      {
        title: 'How Travel Agents Extract 40% Margins on NDC Bookings',
        slug: 'travel-agent-ndc-margins',
        excerpt:
          'NDC is not just a new API. For agents who understand fare construction, it is a margin expansion engine. Here is how the top performers do it.',
        categorySlug: 'airlines',
        cover: '/images/blog/travel-agent-ndc-margins.jpg',
        keywords:
          'NDC, travel agents, airline margins, ancillaries, fare construction',
        status: 'PUBLISHED' as const,
        bodyHtml: `<p>When IATA launched its NDC standard, the industry narrative was about "modern retailing." Airlines talked about ancillaries and personalized offers. Agents were told to prepare for a technical migration. What nobody emphasized was that NDC is, first and foremost, a fare differential event.</p>
<h3>The GDS-NDC gap in revenue</h3><p>NDC bookings consistently show a 20 to 40 percent higher revenue per ticket compared to the same route booked through EDIFACT/GDS. This is not because NDC tickets are more expensive — the base fare is often identical or lower. The difference comes from the agent's ability to see and sell ancillaries that are invisible in the legacy GDS response.</p>
<p>On a GDS search, a Dubai-London flight returns a price. On an NDC search, the same flight returns the price plus 8 to 15 priced ancillary items: seat upgrades, extra baggage, lounge access, fast-track security, priority boarding, meals, Wi-Fi. The GDS agent sells a ticket. The NDC agent sells an itinerary.</p>
<h3>Constructed fares beat published fares</h3><p>NDC gives agents access to fare construction logic that used to be airline-internal. A Karachi-Jeddah-Karachi itinerary can be constructed using a combination of fare classes that the GDS never surfaces. The difference on a single booking: USD 60-120. On 50 bookings a month: USD 5,000 in pure margin.</p>
<h3>Where the 40% comes from</h3><p>Break down a single NDC booking: base fare (USD 350), seat selection (USD 45), extra baggage (USD 60), meal upgrade (USD 18), lounge pass (USD 55). Total sell price: USD 528. The agent pays the carrier USD 350 for the ticket and the ancillary cost. Their revenue is USD 178 on a USD 350 sale — a 50.8% margin on the core product.</p>
<p>Agents using TravelsOTA's NDC integration report average ancillary attachment rates of 2.3 items per booking across their entire book of business.</p>
<h3>The catch</h3><p>NDC requires real-time pricing revalidation. The fare you see at search may not match the fare at booking — airlines adjust prices in real time. TravelsOTA's booking workflow re-prices before every confirmation, rejecting bookings where the price drift exceeds the configured tolerance (default 5%). This prevents the most common NDC revenue killer: repricing surprises at the payment step.</p>`,
      },
      {
        title: 'Dubai vs Doha vs Abu Dhabi — Which Hub Actually Delivers?',
        slug: 'dubai-doha-abu-dhabi-comparison',
        excerpt:
          'Three Gulf cities, three world-class airports. If you are routing through the Middle East, the choice between DXB, DOH, and AUH has real consequences for your trip.',
        categorySlug: 'destinations',
        cover: '/images/blog/dubai-doha-abu-dhabi-comparison.jpg',
        keywords:
          'DXB, DOH, AUH, Gulf hubs, Dubai airport, Doha airport, transit comparison',
        status: 'PUBLISHED' as const,
        featured: true,
        bodyHtml: `<p>Every major route between Asia and Europe transits through the Gulf. The three hubs — Dubai International, Hamad International, and Abu Dhabi International — process over 200 million passengers annually. The differences between them matter less for transit than their respective airlines do.</p>
<h3>DXB: volume is the feature</h3><p>Dubai International handles more international passengers than any airport on earth. Terminal 3, exclusive to Emirates, is a city masquerading as a transit hub. The advantage is frequency: Emirates operates 6-8 daily flights on major routes, giving you far more rebooking options when things go wrong. The downside: the sheer scale means it takes 25 minutes minimum to walk from one end of Concourse B to the far gates, even with travelators.</p>
<h3>DOH: the premium play</h3><p>Hamad International is smaller (40 million vs 87 million passengers) and deliberately premium. Qatar Airways uses it as a product showcase: the Al Mourjan business lounge is 10,000 square metres with private nap rooms and a medical centre. Connection times are tighter — the airport is designed for efficient transfers. If you are flying business class, Doha is the best ground experience in the region.</p>
<h3>AUH: the quiet option</h3><p>Abu Dhabi's new Midfield Terminal (Terminal A) opened in 2023 and the airport now has capacity it has not yet filled. Etihad operates fewer frequencies than Emirates or Qatar but the airport experience is striking in its absence of crowds. Immigration takes 3 minutes instead of 30. If you are transiting through the Gulf at peak season (December, January), AUH is the stealth winner — the empty terminal is a genuine advantage.</p>
<h3>What to actually base your choice on</h3><p>The airport matters for transit experience. But the airline determines the schedule, the seat, and the rebooking options. Emirates wins on frequency, Qatar on service, Etihad on price on certain routes. Check the departure time, not the airport name. TravelsOTA searches all three hubs simultaneously through Travelport NDC+GDS integration. You see the full market, not just one airline's inventory.</p>`,
      },
      {
        title:
          'What the Hotelbeds API Migration Means for Your Platform in 2026',
        slug: 'hotelbeds-api-migration-2026',
        excerpt:
          'The Hotelbeds API v3 deprecation deadline is approaching. If your platform still runs on v2, the migration order matters more than the migration itself.',
        categorySlug: 'hotels',
        cover: '/images/blog/hotelbeds-api-migration-2026.jpg',
        keywords:
          'Hotelbeds, API migration, hotel distribution, bed banks, travel technology',
        status: 'PUBLISHED' as const,
        bodyHtml: `<p>Hotelbeds announced deprecation of their v2 REST API with a migration window that ends in early 2026. If your booking platform integrates with Hotelbeds, the move to v3 is not optional. But the migration order — what you change first, what you leave for later — determines whether you have a smooth cutover or a week of failed bookings.</p>
<h3>The breaking changes that matter</h3><p>V3 moves room distribution from a flat list to a nested rateKey + roomKey structure. If your booking flow assumes one rateKey per search result, you are in for a rewrite. Multi-room bookings now require room-by-room rate validation using the new checkRate endpoint. The old pattern of one availability call followed by one booking call no longer works for anything beyond a single-room booking.</p>
<h3>Rate validation: the silent killer</h3><p>The v3 checkRate endpoint returns a price that may differ from the search price by up to the supplier's tolerance. If you do not re-price before booking, you are accepting whatever the supplier charges at the confirmation step. TravelsOTA's implementation validates rates before every booking and rejects if the drift exceeds 5 percent.</p>
<h3>mTLS is now a production requirement</h3><p>While mTLS was optional in v2, Hotelbeds recommends it for v3 production traffic. Without it, your requests carry only API key authentication. With it, the connection itself is authenticated, reducing the blast radius of a key leak. TravelsOTA supports mTLS out of the box through its HTTP client configuration.</p>
<h3>The migration order</h3><p>Step one: update the content pipeline. Step two: migrate search. Validate results match v2. Step three: migrate rate check. Step four: migrate booking and cancellation. Never migrate two steps in one deployment.</p>`,
      },
      {
        title: 'The Frequent Flyer Dead Zones Nobody Talks About',
        slug: 'frequent-flyer-dead-zones',
        excerpt:
          'Miles are not money. They expire in ways the airline will not advertise, and the sweet spots shift with every devaluation.',
        categorySlug: 'airlines',
        cover: '/images/blog/frequent-flyer-dead-zones.jpg',
        keywords:
          'frequent flyer miles, loyalty programs, mile expiry, award redemption, devaluation',
        status: 'PUBLISHED' as const,
        bodyHtml: `<p>Frequent flyer programs are loyalty accounting systems designed by people who understand behavioral economics better than you understand your own spending patterns. The miles you earn today are not the miles you will redeem tomorrow — they are a depreciating liability on the airline's balance sheet, and the airline manages that liability through expiry policies and devaluation tables.</p>
<h3>Expiry is not just "no activity for 18 months"</h3><p>Every major program has a different expiry trigger. American Airlines AAdvantage: 24 months of inactivity. Emirates Skywards: 3 years from earning, period — activity does not reset the expiry date. Qatar Airways Privilege Club: 36 months, but only for non-elite members. The common assumption that "any activity resets the clock" is false for several GCC carriers because they use a fixed expiry from earning date, not a rolling activity window.</p>
<h3>Devaluation happens silently</h3><p>Airline loyalty programs increase award ticket prices in miles without notice. A Dubai-London business class award that cost 90,000 miles in December might cost 120,000 in January. If you are saving for a specific redemption, check award availability and price monthly — the price will almost certainly increase before it decreases.</p>
<h3>The transfer partner sweet spot</h3><p>Program-issued miles are worth significantly less when redeemed for flights on the issuing airline. Emirates Skywards miles redeemed for Emirates flights: roughly 1 cent per mile. The same balance transferred to a partner through a flexible points program can yield 1.5 to 4 cents per mile on premium cabin redemptions. The value is in the transfer, not the earn.</p>
<h3>The 3-year rule for oneworld carriers</h3><p>If you are earning on oneworld, every mile earned more than 3 years ago is at imminent risk of expiry. Before buying replacement miles at 2.5-3.5 cents each, check whether your balance is close to expiry — you may be better off redeeming now for a lower-value award than losing the miles entirely.</p>`,
      },
      {
        title: 'A Practical Guide to Umrah Travel Packages in 2026',
        slug: 'umrah-travel-guide-2026',
        excerpt:
          'The Umrah travel market is built on relationships, not search engines. Here is how agents structure packages and manage seasonal demand.',
        categorySlug: 'travel-tips',
        cover: '/images/blog/umrah-travel-guide-2026.jpg',
        keywords:
          'Umrah packages, Makkah hotels, Jeddah flights, pilgrimage travel, seasonal pricing',
        status: 'PUBLISHED' as const,
        bodyHtml: `<p>Umrah is a year-round pilgrimage, but the market operates on distinct seasonal patterns: Ramadan, school holidays in the GCC and South Asia, and the pre-Hajj window. An agent who understands the seasonal pricing curve captures margins that a generalist cannot touch.</p>
<h3>Package components that actually drive price</h3><p>An Umrah package has exactly four cost components: visa, flight, hotel, and ground transport. The flight is the single largest variable. A peak-Ramadan ticket Karachi-Jeddah can cost USD 800-1,200 compared to USD 350-500 off-peak. Agents who lock in group block bookings 6 months out secure rates that individual travelers cannot access.</p>
<h3>Hotel zones: the actual distances matter</h3><p>Hotels in Makkah are priced by distance from the Haram, and every 200-metre increment adds roughly USD 40-80 per night in peak season. Hotels in the premium zone are not on OTAs — they are sold exclusively through block allocations to established agents.</p>
<h3>The visa bottleneck</h3><p>Saudi Arabia's tourist visa now covers Umrah for many nationalities, but group pilgrims from South Asia still process through licensed Umrah operators. Visa issuance volume is capped per operator and per season. TravelsOTA's agent portal supports group booking workflows that track visa status, hotel allocations, and transport manifests.</p>
<h3>Why most packages fail at the pricing stage</h3><p>The common failure mode is hotels that confirm availability at one rate and then reprice at confirmation. Every Umrah operator should re-price their hotel component 72 hours before traveler arrival and again 24 hours before, with a pre-defined tolerance threshold.</p>`,
      },
      {
        title:
          'Why Your Hotel Search Shows 4 Different Prices for the Same Room',
        slug: 'hotel-price-discrepancy',
        excerpt:
          'One hotel room, four prices. The explanation involves rate codes, channel distribution, and a supply chain that optimizes for revenue, not transparency.',
        categorySlug: 'hotels',
        cover: '/images/blog/hotel-price-discrepancy.jpg',
        keywords:
          'hotel rates, bed banks, wholesale pricing, OTA rates, hotel distribution',
        status: 'PUBLISHED' as const,
        bodyHtml: `<p>If you search for the same hotel room on three different sites right now, you will see three different prices. Sometimes four. The room is identical. The difference is not a bug — it is rate code distribution.</p>
<h3>Rate codes, not room types, set the price</h3><p>A hotel creates rate codes for each distribution channel. The OTA rate code carries a different commission structure than the wholesale rate code. When you search through a GDS-connected travel agent, you see the GDS rate — which is often 8-15 percent lower because the distribution cost to the hotel is lower.</p>
<h3>The bed bank effect</h3><p>Bed banks — Hotelbeds, Webbeds, Travco — buy hotel inventory in bulk at net rates and resell at a markup. A bed bank might have a net rate of USD 80 on a room that the OTA sells for USD 110. This is why travel agents who use Hotelbeds-connected platforms like TravelsOTA can consistently beat public OTA pricing.</p>
<h3>Dynamic rate changes within a single search session</h3><p>Some hotel revenue management systems adjust rates based on search volume. If a hotel receives 15 searches for the same dates within a 5-minute window, the rate increases. The fix is not to search repeatedly. Search once. Book or do not.</p>
<h3>Wholesale vs retail: the structural gap</h3><p>Wholesale rates (accessed through bed banks and GDS) are 15-40 percent below OTA rates on average. The travel agent's value proposition is aggregating demand to access wholesale pricing and passing the savings to the customer — keeping a spread for themselves.</p>`,
      },
      {
        title: 'Southeast Asia on USD 40 a Day — A Real Budget Breakdown',
        slug: 'southeast-asia-budget-travel',
        excerpt:
          'Not aspirational, not theoretical. Actual daily costs from 4 countries, with line items. Some destinations are cheaper than you think. One is not.',
        categorySlug: 'deals',
        cover: '/images/blog/southeast-asia-budget-travel.jpg',
        keywords:
          'budget travel, Southeast Asia, Vietnam cost, Thailand cost, Indonesia budget, Malaysia prices',
        status: 'PUBLISHED' as const,
        bodyHtml: `<p>Budget travel content tends toward either the absurd ("I lived on USD 5 a day eating street noodles") or the useless ("budget depends on your travel style"). Neither helps you plan. Here are actual numbers from four Southeast Asian countries, based on mid-range budget travel — private room, local restaurants, paid activities.</p>
<h3>Vietnam — USD 28/day</h3><p>Private room in a family-run guesthouse: USD 8-12. Street food meals: USD 1.50-2.50 each. Coffee: USD 0.80. Motorbike rental: USD 6/day including fuel. Entry fees: USD 2-4. Total: about USD 28. Hanoi and HCMC are slightly more — figure USD 32. Da Nang and Hoi An are less.</p>
<h3>Thailand — USD 35/day</h3><p>Private room: USD 12-20. Bangkok is the most expensive accommodation market in the region for budget travelers — rooms under USD 15 exist but you will trade location for price. A day in Chiang Mai costs about USD 25. A day in Bangkok costs about USD 40.</p>
<h3>Indonesia — USD 25/day (outside Bali)</h3><p>Java outside Jakarta: guesthouse room USD 6-10. Local meal: USD 1-1.50. Entrance to Borobudur: USD 25 (the single most expensive tourist item on Java). Bali is an entirely different price tier — figure USD 55-80/day for the same standard.</p>
<h3>Malaysia — USD 38/day</h3><p>The most expensive on this list, mainly because of accommodation. A private room in a decent hotel in Kuala Lumpur: USD 20-30. Food courts: USD 2.50-4.00 for a full meal. The LRT and MRT in KL are excellent and cheap — USD 1-2 per ride.</p>
<h3>The USD 40/day rule</h3><p>Four countries, four different cost structures. The pattern holds: accommodation is 35-45 percent of the daily cost, food is 20-25 percent, transport 15-20 percent, activities 15-20 percent. Do not book accommodation online at rack rate. Walk into guesthouses and ask for the walk-in rate — you will pay 30-40 percent less than the online price.</p>`,
      },
      // New posts
      {
        title: 'When to Book Flights: What the Pricing Data Actually Shows',
        slug: 'flight-booking-windows',
        excerpt:
          '"Book on Tuesday at 3pm" is folklore. We looked at how fares really move across 90-day windows — and when the sweet spot opens for each route type.',
        categorySlug: 'deals',
        cover: '/images/blog/flight-booking-windows.jpg',
        keywords:
          'when to book flights, airfare pricing, booking window, cheap flights, fare data',
        status: 'PUBLISHED' as const,
        featured: true,
        bodyHtml: `<p>Every few months a study claims to have found the perfect day to book flights. Tuesday afternoon. Six weeks out. Forty-nine days exactly. Most of these findings fall apart on contact with real routes because airfare pricing is not a single market — it is thousands of fare classes managed independently per route, per season, per competition level.</p>
<h3>The three pricing phases every route goes through</h3><p>Phase one, from schedule release to roughly T-minus-60 days: airlines publish their cheapest fare classes with deep seat allocations. Prices move slowly. Phase two, T-minus-60 to T-minus-21: the cheap buckets sell out progressively and the median fare climbs 20-35%. Phase three, the final three weeks: fares decouple from logic entirely. Business demand takes over, and economy prices can double inside ten days.</p>
<h3>Domestic short-haul: 3 weeks to 3 months</h3><p>On dense domestic routes (Karachi-Lahore, Dubai-Jeddah, Bangkok-Chiang Mai) the sweet spot sits between 25 and 80 days out. Booking earlier rarely helps — airlines open cheap buckets closer in when competition demands it. Booking later costs you: inside two weeks, expect to pay 40-60% above the window average.</p>
<h3>Long-haul international: 2 to 5 months</h3><p>Dubai to London behaves differently. Long-haul fare classes are deeper but more volatile — fuel surcharges and currency swings get baked into fares weekly. The reliable window is 60 to 150 days out. Peak-season travel (December, Eid, summer holidays) shifts this earlier: book 5-6 months ahead because the cheapest classes genuinely sell out, not just rise in price.</p>
<h3>The exception that proves the rule: peak Ramadan and Hajj corridors</h3><p>Jeddah and Madinah routes do not follow any normal curve. Fares climb monotonically from the day Ramadan dates are announced and never come down. There is no sweet spot — only earlier versus later. Book the moment dates are confirmed.</p>
<h3>What actually saves money</h3><p>Flexibility beats timing. Shifting departure by one day frequently changes the fare more than shifting the booking date by one month. Set fare alerts on TravelsOTA, watch a specific route for a week, and strike when the fare dips below the route median — not when a calendar tells you to.</p>`,
      },
      {
        title: 'Venice in 48 Hours Without the Crowds',
        slug: 'venice-without-the-crowds',
        excerpt:
          'Venice receives 30 million visitors a year into a city of 50,000 residents. Here is how to see it properly while barely touching the crowds.',
        categorySlug: 'destinations',
        cover: '/images/blog/venice-without-the-crowds.jpg',
        keywords:
          'Venice travel guide, Italy, Venice itinerary, avoid crowds Venice, Venice tips',
        status: 'PUBLISHED' as const,
        featured: true,
        bodyHtml: `<p>Venice does not have an overcrowding problem. It has a routing problem. Thirty million visitors funnel down the same two-kilometre corridor between the train station and St Mark\'s Square, while 90% of the city\'s 118 islands sit nearly empty. Two days is enough to fall in love with Venice — if you route yourself differently.</p>
<h3>Day one morning: the empty half</h3><p>Land at Marco Polo, take the Alilaguna boat (€15, 75 minutes — the vaporetto experience tourists pay triple for), and walk east from the Arsenale rather than west toward San Marco. Via Garibaldi is a working neighbourhood street: fishmongers, cicchetti bars at breakfast prices, locals arguing about football. Castello district beyond it holds three of Venice\'s ten best churches and almost none of its tourists.</p>
<h3>Day one afternoon: St Mark\'s, done correctly</h3><p>Go at 16:00. By late afternoon the day-trippers have shipped out on their buses and cruise boats, the light turns gold on the Basilica mosaics, and the piazza regains the proportions Napoleon allegedly called Europe\'s drawing room. Book the Basilica\'s terrace loggia online — same price, separate entrance, ten people instead of ten thousand. Doge\'s Palace last entry is 17:00 and by then there is no queue.</p>
<h3>Day one evening: where Venetians eat</h3><p>Alla Vedova in Cannaregio serves polpette meatballs that have anchored the neighborhood since 1954. Order a spritz, stand at the counter, spend €12. Skip any restaurant with a photo menu, a "tourist menu" sign, or a host calling to you from the door — all three mark the places that give Venice its bad food reputation.</p>
<h3>Day two morning: the islands, reversed</h3><p>Everyone does Murano-Burano in that order, arriving mid-morning into tour-group density. Reverse it: take the 12 line to Burano at 08:30 when the fishing boats are unloading and the painted houses belong to residents, not photographers. Burano\'s lace shops open at nine; by eleven the buses arrive. You will already be on the 14 line to Murano\'s quiet north end, where glass workshops sell seconds at a third of the main drag prices.</p>
<h3>Day two afternoon: the finale</h3><p>Return by 14:00, walk the Riva degli Schiavoni against the crowd flow to Santa Maria della Salute — Palladio\'s domed masterpiece at the canal mouth, free entry, perpetually uncrowded. Climb the Punta della Dogana point for the exact view Canaletto painted. Then sit. You have seen Venice: the working city, the golden piazza, the painted islands, the postcard view — and spent most of forty-eight hours away from the queue.</p>
<h3>Practical notes</h3><p>The Venice Access Fee (€5-10) applies to day-trippers on peak days; overnight guests are exempt but must register via the web app for the QR code. Water taxis from the airport cost €120 — the Alilaguna is a seventh of that and equally scenic. Pack wheels-free luggage: 385 bridges make rolling suitcases a public nuisance.</p>`,
      },
    ];

    let postIdx = 0;
    for (const post of blogPosts) {
      const category = await this.prisma.blogCategory.findUnique({
        where: { slug: post.categorySlug },
      });
      if (!category) continue;

      const publishedAt =
        post.status === 'PUBLISHED'
          ? new Date(Date.now() - (++postIdx + 2) * 4 * 86400000)
          : null;

      await this.prisma.blogPost.upsert({
        where: { slug: post.slug },
        create: {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          bodyHtml: post.bodyHtml,
          status: post.status,
          categoryId: category.id,
          metaTitle: post.title,
          metaDescription: post.excerpt,
          metaKeywords: post.keywords,
          coverImageUrl: post.cover,
          isFeatured: post.featured ?? false,
          viewCount: ((postIdx * 137) % 900) + 120,
          publishedAt,
        },
        update: {
          title: post.title,
          excerpt: post.excerpt,
          bodyHtml: post.bodyHtml,
          categoryId: category.id,
          metaTitle: post.title,
          metaDescription: post.excerpt,
          metaKeywords: post.keywords,
          coverImageUrl: post.cover,
          isFeatured: post.featured ?? false,
          status: post.status,
          publishedAt,
        },
      });
    }
    dbg(
      `Seeded ${blogPosts.length} blog posts (${blogPosts.filter((p) => p.featured).length} featured)`,
    );

    const cmsPages: Array<{
      name: string;
      slug: string;
      description: string;
      content: string;
    }> = [
      {
        name: 'About Us',
        slug: 'about',
        description:
          'Learn about TravelsOTA — the travel booking platform connecting agents, travelers, and suppliers worldwide.',
        content: `<h2>About TravelsOTA</h2>
<p>TravelsOTA is a multi-channel travel booking platform built for travel agents, enterprise clients, and individual travelers. We connect inventory from Travelport (NDC + GDS) and Hotelbeds to a unified booking workflow that handles search, pricing, payment, ticketing, and post-booking management — all through a single interface.</p>
<h3>What We Do</h3>
<p>Our platform provides three distinct dashboards for three user types:</p>
<ul>
<li><strong>Admin Panel:</strong> Full operational control — user management, role-based access, provider configuration, payment gateway setup, booking oversight, analytics, and audit trails.</li>
<li><strong>Agent Dashboard:</strong> White-label booking tools with commission tracking, markup management, credit limits, sub-agent management, and real-time reporting. Agents can sell flights and hotels under their own brand.</li>
<li><strong>Customer Portal:</strong> Search and book flights and hotels with transparent pricing, multiple payment options (Stripe, PayPal), and real-time booking status tracking.</li>
</ul>
<h3>Our Technology</h3>
<p>TravelsOTA is built on Travelport's uAPI (Universal API), which provides access to both NDC (New Distribution Capability) and traditional GDS (EDIFACT) inventory from over 400 airlines. Our hotel inventory comes from Hotelbeds, one of the world's largest bed banks, with access to over 180,000 properties in 140 countries.</p>
<p>The platform uses a hexagonal architecture on NestJS with PostgreSQL for transactional consistency, Redis for caching, and Typesense for search indexing. Every booking goes through a price re-validation step before confirmation, protecting both the traveler and the agent from rate drift between search and payment.</p>
<h3>Who We Serve</h3>
<p>Our primary users are travel agencies — from solo agents managing 50 bookings a month to corporate agencies processing thousands. The platform handles commission structures, credit limits, markup rules, and sub-agent hierarchies out of the box, eliminating the spreadsheet-driven operations that dominate much of the industry.</p>`,
      },
      {
        name: 'Terms of Service',
        slug: 'terms',
        description:
          'Terms and conditions governing the use of the TravelsOTA platform.',
        content: `<h2>Terms of Service</h2>
<p>Last updated: January 2026</p>
<p>These Terms of Service govern your access to and use of the TravelsOTA platform, including any content, functionality, and services offered through our website and APIs. By using TravelsOTA, you agree to be bound by these terms.</p>
<h3>1. Definitions</h3>
<p>"Platform" refers to the TravelsOTA website, APIs, and related services. "User" refers to any individual or entity accessing the platform. "Agent" refers to a registered travel agent using the platform for commercial bookings. "Customer" refers to an end traveler booking travel services through the platform or an agent.</p>
<h3>2. Account Registration</h3>
<p>Users must provide accurate and complete information during registration. You are responsible for maintaining the confidentiality of your account credentials. TravelsOTA reserves the right to suspend or terminate accounts that violate these terms or engage in fraudulent activity. Agent accounts require additional verification including KYC documentation and approval by TravelsOTA administrators.</p>
<h3>3. Booking and Payment</h3>
<p>All bookings are subject to availability and supplier terms. Prices displayed at the time of search are indicative and are re-validated at the time of booking confirmation. A booking is only confirmed when payment has been successfully processed and a booking reference has been issued. TravelsOTA does not guarantee pricing until the payment confirmation step is complete.</p>
<p>Payments are processed through PCI-DSS compliant gateways (Stripe, PayPal). TravelsOTA does not store full credit card numbers. All transactions are encrypted in transit and at rest.</p>
<h3>4. Cancellation and Refunds</h3>
<p>Cancellation policies vary by supplier, fare class, and rate type. Cancellation requests are processed through the original booking channel. Refund amounts are determined by the supplier's cancellation policy and any applicable TravelsOTA service fees. Refunds are processed to the original payment method within 5-15 business days of supplier confirmation.</p>
<h3>5. Agent Terms</h3>
<p>Agents are responsible for all bookings made through their accounts and sub-agent accounts. Commission rates, markup rules, and credit limits are set by agreement with TravelsOTA. Agents must maintain sufficient credit balance for all bookings. TravelsOTA reserves the right to suspend agent accounts that exceed credit limits or engage in chargeback-heavy booking patterns.</p>
<h3>6. Limitation of Liability</h3>
<p>TravelsOTA acts as an intermediary between users and travel suppliers. We are not liable for supplier errors, schedule changes, cancellations, or service failures. Our liability is limited to the service fees charged by TravelsOTA for the specific transaction. We do not provide travel insurance — travelers are strongly advised to obtain appropriate coverage.</p>
<h3>7. Data Protection</h3>
<p>User data is handled in accordance with our Privacy Policy. TravelsOTA implements AES-256-GCM encryption for sensitive configuration data at rest, TLS 1.3 for data in transit, and role-based access controls for all administrative operations. Personal data is retained only as long as necessary to fulfill the purposes for which it was collected.</p>
<h3>8. Modifications</h3>
<p>TravelsOTA reserves the right to modify these terms at any time. Users will be notified of material changes via email or platform notification. Continued use of the platform after changes take effect constitutes acceptance of the modified terms.</p>`,
      },
      {
        name: 'Privacy Policy',
        slug: 'privacy',
        description:
          'How TravelsOTA collects, uses, and protects your personal information.',
        content: `<h2>Privacy Policy</h2>
<p>Last updated: January 2026</p>
<p>TravelsOTA takes your privacy seriously. This policy describes what information we collect, how we use it, and the choices you have regarding your personal data.</p>
<h3>Information We Collect</h3>
<p><strong>Account information:</strong> Name, email address, phone number, company name, and tax identification number (for agents).</p>
<p><strong>Booking information:</strong> Traveler names, dates of birth, passport numbers, nationality, contact details, and payment method information. This data is required by travel suppliers for ticketing and regulatory compliance.</p>
<p><strong>Technical information:</strong> IP address, browser type, device information, and usage patterns collected through standard server logs and analytics.</p>
<h3>How We Use Your Information</h3>
<ul>
<li>To process bookings and payments through our supplier network</li>
<li>To verify agent identities and maintain KYC compliance</li>
<li>To communicate booking confirmations, changes, and cancellations</li>
<li>To provide customer support and respond to inquiries</li>
<li>To improve platform performance and security</li>
<li>To comply with legal obligations and regulatory requirements</li>
</ul>
<h3>Data Sharing</h3>
<p>We share traveler information with travel suppliers (airlines, hotels, bed banks) solely for the purpose of fulfilling bookings. We share payment information with PCI-DSS compliant payment processors (Stripe, PayPal) for transaction processing. We do not sell, rent, or trade personal information to third parties for marketing purposes.</p>
<h3>Data Retention</h3>
<p>Account information is retained for the duration of your account plus 90 days after account closure. Booking records are retained for 7 years to comply with tax and audit requirements. Payment records are retained per PCI-DSS and local financial regulations. You may request deletion of your personal data by contacting support@travelsota.com, subject to legal retention obligations.</p>
<h3>Your Rights</h3>
<p>You have the right to access, correct, or delete your personal data. You may object to processing, restrict processing, and request data portability. To exercise these rights, contact our Data Protection Officer at privacy@travelsota.com. We will respond within 30 days.</p>
<h3>Security</h3>
<p>We implement AES-256-GCM encryption for sensitive configuration data at rest, TLS for data in transit, role-based access controls, and audit logging for all administrative operations. Provider credentials and payment gateway secrets are encrypted before storage and never appear in logs or responses.</p>
<h3>Cookies</h3>
<p>TravelsOTA uses essential cookies for authentication and session management. We do not use third-party tracking cookies for advertising purposes. Session cookies expire when you close your browser. Persistent cookies used for authentication expire based on your account settings.</p>`,
      },
      {
        name: 'Contact Us',
        slug: 'contact',
        description: 'Get in touch with the TravelsOTA team.',
        content: `<h2>Contact Us</h2>
<p>We are here to help. Reach out through any of the channels below and our team will respond within one business day.</p>
<h3>General Inquiries</h3>
<p><strong>Email:</strong> support@travelsota.com<br />
<strong>Phone:</strong> +971 4 123 4567<br />
<strong>Hours:</strong> Sunday – Thursday, 9:00 AM – 6:00 PM GST (UTC+4)</p>
<h3>Sales</h3>
<p><strong>Email:</strong> sales@travelsota.com<br />
<strong>Phone:</strong> +971 4 123 4568</p>
<h3>Technical Support</h3>
<p><strong>Email:</strong> tech@travelsota.com<br />
<strong>Response SLA:</strong> Critical issues within 4 hours, standard issues within 24 hours</p>
<h3>Office Locations</h3>
<p><strong>Headquarters — Dubai, UAE</strong><br />
Office 1407, The Binary Tower, Business Bay<br />
Dubai, United Arab Emirates</p>
<p><strong>Regional Office — Karachi, Pakistan</strong><br />
Plot 12-C, Shahrah-e-Faisal, Block 6, PECHS<br />
Karachi 75400, Pakistan</p>
<p><strong>Regional Office — London, UK</strong><br />
71-75 Shelton Street, Covent Garden<br />
London WC2H 9JQ, United Kingdom</p>`,
      },
      {
        name: 'Frequently Asked Questions',
        slug: 'faqs',
        description:
          'Answers to common questions about booking, payments, cancellations, and more on TravelsOTA.',
        content: `<h2>Frequently Asked Questions</h2>
<h3>Booking</h3>
<p><strong>How do I search for flights?</strong><br />Use the search form on the homepage. Enter your origin and destination, select dates, choose cabin class and number of travelers, then click Search. Results appear within seconds, sourced from Travelport NDC+GDS inventory covering over 400 airlines.</p>
<p><strong>Can I book multi-city itineraries?</strong><br />Yes. Select "Multi-City" from the trip type dropdown and add up to 6 legs. Each leg can have a different origin, destination, and date.</p>
<p><strong>How do I book a hotel?</strong><br />Switch to the Hotels tab on the search form. Enter a destination or hotel name, check-in and check-out dates, number of rooms and guests, then click Search. Results come from Hotelbeds inventory covering over 180,000 properties worldwide.</p>
<p><strong>Is my booking confirmed immediately?</strong><br />Your booking is confirmed when payment is processed and you receive a booking reference number. Until then, the booking is in "pending" status. Most bookings confirm within 30 seconds. Some supplier workflows may take up to 2 minutes.</p>
<h3>Payments</h3>
<p><strong>What payment methods are accepted?</strong><br />We accept Visa, Mastercard, American Express via Stripe, and PayPal. Payment gateways are PCI-DSS compliant. We do not store your full card number.</p>
<p><strong>When is my card charged?</strong><br />Your card is charged at the time of booking confirmation. If the booking fails, the authorization is voided immediately. Refunds are processed to the original payment method.</p>
<p><strong>Can I pay in my local currency?</strong><br />TravelsOTA supports 20+ currencies including USD, EUR, GBP, PKR, AED, SAR, INR, and BDT. Currency conversion uses exchange rates updated daily. Select your preferred currency in the currency selector during checkout.</p>
<h3>Cancellation and Refunds</h3>
<p><strong>How do I cancel a booking?</strong><br />Log into your account, go to My Bookings, select the booking, and click Cancel. The system will calculate any applicable cancellation fees based on the supplier's policy and display them before you confirm the cancellation.</p>
<p><strong>How long do refunds take?</strong><br />Refunds are processed to your original payment method within 5-15 business days after the supplier confirms the cancellation. The exact timeline depends on your bank or card issuer.</p>
<h3>For Agents</h3>
<p><strong>How do I set my markup?</strong><br />Agents can configure flight markups, hotel markups, and commission rates in their Agent Dashboard under Settings. Markups are applied at the time of booking preview and are visible in the price breakdown.</p>
<p><strong>What is a credit limit?</strong><br />Your credit limit is the maximum total value of unpaid bookings you can have at any time. Each booking reduces your available credit. When a booking is paid, the credit is released. Exceeding your credit limit will prevent new bookings until existing ones are settled.</p>
<p><strong>Can I manage sub-agents?</strong><br />Yes. Approved agents can create sub-agent accounts, set their credit limits, markups, commission rates, and permissions from the Agent Dashboard. Sub-agent bookings count against the parent agent's credit limit.</p>
<h3>Technical</h3>
<p><strong>Is there an API?</strong><br />Yes. Contact sales@travelsota.com for API documentation and access credentials. Our REST API supports flight search, hotel search, booking, payment, and cancellation endpoints with JWT-based authentication.</p>
<p><strong>Is my data secure?</strong><br />All connections use TLS 1.3 encryption. Provider credentials are encrypted with AES-256-GCM before storage. Payment data is handled by PCI-DSS Level 1 compliant processors. We maintain audit logs of all administrative operations.</p>`,
      },
    ];

    for (const page of cmsPages) {
      await this.prisma.cmsPage.upsert({
        where: { slug: page.slug },
        create: {
          name: page.name,
          slug: page.slug,
          description: page.description,
          content: page.content,
          isActive: true,
        },
        update: {
          name: page.name,
          description: page.description,
          content: page.content,
        },
      });
    }
    dbg('Seeded CMS pages');

    // ── CMS Menus ── (truncated on reset; delete + recreate on startup)
    await this.prisma.cmsMenu.deleteMany();
    const items: Array<{
      label: string;
      slug: string | null;
      url: string | null;
      sortOrder: number;
      position: 'HEADER' | 'FOOTER';
    }> = [
      {
        label: 'About',
        slug: 'about',
        url: null,
        sortOrder: 1,
        position: 'HEADER',
      },
    ];

    for (const item of items) {
      const pageId = item.slug
        ? ((
            await this.prisma.cmsPage.findUnique({ where: { slug: item.slug } })
          )?.id ?? null)
        : null;

      await this.prisma.cmsMenu.create({
        data: {
          label: item.label,
          linkType: pageId ? 'PAGE' : 'EXTERNAL',
          pageId,
          url: pageId ? null : item.url,
          target: 'SELF',
          position: item.position,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
    }
    dbg('Seeded 1 CMS menu item');

    // ── Manual Flights (10 seeded, 6 featured) ──
    // Images are served from the frontend's own /images/hotels/ directory —
    // no external CDN dependency (external URLs broke on live hosting).
    const px = (id: number) => `/images/hotels/${id}.jpg`;

    const manualFlights: Array<{
      airline: string;
      flightNumber: string;
      originId: string;
      originCity: string;
      destinationId: string;
      destCity: string;
      daysOut: number;
      departureTime: string;
      arrivalTime: string;
      duration: string;
      basePrice: number;
      cabinClass: string;
      refundable: boolean;
      featuredOrder?: number;
      hasWifi: boolean;
      hasMeal: boolean;
      checkedBaggage: string;
      cabinBaggage: string;
    }> = [
      // Featured — displayed on the homepage in this order
      {
        airline: 'Pakistan International',
        flightNumber: 'PK-301',
        originId: 'LHE',
        originCity: 'Lahore',
        destinationId: 'DXB',
        destCity: 'Dubai',
        daysOut: 14,
        departureTime: '08:00',
        arrivalTime: '10:15',
        duration: '3h 15m',
        basePrice: 350,
        cabinClass: 'Economy',
        refundable: false,
        featuredOrder: 1,
        hasWifi: false,
        hasMeal: true,
        checkedBaggage: '25 kg',
        cabinBaggage: '7 kg',
      },
      {
        airline: 'Emirates',
        flightNumber: 'EK-623',
        originId: 'DXB',
        originCity: 'Dubai',
        destinationId: 'LHR',
        destCity: 'London',
        daysOut: 21,
        departureTime: '02:30',
        arrivalTime: '06:45',
        duration: '7h 15m',
        basePrice: 890,
        cabinClass: 'Economy',
        refundable: true,
        featuredOrder: 2,
        hasWifi: true,
        hasMeal: true,
        checkedBaggage: '30 kg',
        cabinBaggage: '7 kg',
      },
      {
        airline: 'Qatar Airways',
        flightNumber: 'QR-915',
        originId: 'KHI',
        originCity: 'Karachi',
        destinationId: 'JED',
        destCity: 'Jeddah',
        daysOut: 28,
        departureTime: '11:00',
        arrivalTime: '14:20',
        duration: '5h 20m',
        basePrice: 580,
        cabinClass: 'Economy',
        refundable: false,
        featuredOrder: 3,
        hasWifi: true,
        hasMeal: true,
        checkedBaggage: '30 kg',
        cabinBaggage: '7 kg',
      },
      {
        airline: 'Turkish Airlines',
        flightNumber: 'TK-761',
        originId: 'DXB',
        originCity: 'Dubai',
        destinationId: 'IST',
        destCity: 'Istanbul',
        daysOut: 35,
        departureTime: '21:00',
        arrivalTime: '00:45',
        duration: '4h 45m',
        basePrice: 520,
        cabinClass: 'Economy',
        refundable: false,
        featuredOrder: 4,
        hasWifi: true,
        hasMeal: true,
        checkedBaggage: '23 kg',
        cabinBaggage: '8 kg',
      },
      {
        airline: 'EgyptAir',
        flightNumber: 'MS-962',
        originId: 'CAI',
        originCity: 'Cairo',
        destinationId: 'JED',
        destCity: 'Jeddah',
        daysOut: 42,
        departureTime: '07:00',
        arrivalTime: '09:50',
        duration: '2h 50m',
        basePrice: 290,
        cabinClass: 'Economy',
        refundable: false,
        featuredOrder: 5,
        hasWifi: false,
        hasMeal: true,
        checkedBaggage: '23 kg',
        cabinBaggage: '7 kg',
      },
      {
        airline: 'Pakistan International',
        flightNumber: 'PK-785',
        originId: 'ISB',
        originCity: 'Islamabad',
        destinationId: 'LHR',
        destCity: 'London',
        daysOut: 49,
        departureTime: '10:30',
        arrivalTime: '14:40',
        duration: '8h 10m',
        basePrice: 720,
        cabinClass: 'Economy',
        refundable: true,
        featuredOrder: 6,
        hasWifi: true,
        hasMeal: true,
        checkedBaggage: '30 kg',
        cabinBaggage: '7 kg',
      },
      // Regular inventory
      {
        airline: 'Emirates',
        flightNumber: 'EK-002',
        originId: 'DXB',
        originCity: 'Dubai',
        destinationId: 'JFK',
        destCity: 'New York',
        daysOut: 56,
        departureTime: '03:00',
        arrivalTime: '08:50',
        duration: '13h 50m',
        basePrice: 1350,
        cabinClass: 'Business',
        refundable: true,
        hasWifi: true,
        hasMeal: true,
        checkedBaggage: '40 kg',
        cabinBaggage: '12 kg',
      },
      {
        airline: 'British Airways',
        flightNumber: 'BA-106',
        originId: 'LHR',
        originCity: 'London',
        destinationId: 'JFK',
        destCity: 'New York',
        daysOut: 63,
        departureTime: '09:30',
        arrivalTime: '12:45',
        duration: '7h 15m',
        basePrice: 1180,
        cabinClass: 'Business',
        refundable: true,
        hasWifi: true,
        hasMeal: true,
        checkedBaggage: '2x23 kg',
        cabinBaggage: '8 kg',
      },
      {
        airline: 'Singapore Airlines',
        flightNumber: 'SQ-321',
        originId: 'SIN',
        originCity: 'Singapore',
        destinationId: 'DXB',
        destCity: 'Dubai',
        daysOut: 70,
        departureTime: '09:15',
        arrivalTime: '12:40',
        duration: '7h 25m',
        basePrice: 640,
        cabinClass: 'Economy',
        refundable: false,
        hasWifi: true,
        hasMeal: true,
        checkedBaggage: '30 kg',
        cabinBaggage: '7 kg',
      },
      {
        airline: 'Pakistan International',
        flightNumber: 'PK-212',
        originId: 'KHI',
        originCity: 'Karachi',
        destinationId: 'LHE',
        destCity: 'Lahore',
        daysOut: 77,
        departureTime: '18:30',
        arrivalTime: '19:50',
        duration: '1h 20m',
        basePrice: 95,
        cabinClass: 'Economy',
        refundable: false,
        hasWifi: false,
        hasMeal: false,
        checkedBaggage: '20 kg',
        cabinBaggage: '7 kg',
      },
    ];

    for (const mf of manualFlights) {
      const order = mf.featuredOrder ?? 99;
      await this.prisma.manualFlight.upsert({
        where: { id: `seed-mf-${mf.flightNumber}` },
        create: {
          id: `seed-mf-${mf.flightNumber}`,
          airlineName: mf.airline,
          flightNumber: mf.flightNumber,
          originId: mf.originId,
          originCity: mf.originCity,
          destinationId: mf.destinationId,
          destinationCity: mf.destCity,
          departureDate: new Date(Date.now() + mf.daysOut * 86400000),
          departureTime: mf.departureTime,
          arrivalTime: mf.arrivalTime,
          duration: mf.duration,
          status: 'active',
          featured: !!mf.featuredOrder,
          flightOrder: order,
          basePrice: mf.basePrice,
          currency: 'USD',
          childPricePercent: 75,
          infantPricePercent: 10,
          availableSeats: 45,
          totalSeats: 60,
          refundable: mf.refundable,
          cabinClass: mf.cabinClass,
          hasWifi: mf.hasWifi,
          hasMeal: mf.hasMeal,
          hasEntertainment: true,
          hasPowerOutlet: true,
          checkedBaggage: mf.checkedBaggage,
          cabinBaggage: mf.cabinBaggage,
        },
        update: {
          airlineName: mf.airline,
          basePrice: mf.basePrice,
          refundable: mf.refundable,
          availableSeats: 45,
          checkedBaggage: mf.checkedBaggage,
          cabinClass: mf.cabinClass,
          featured: !!mf.featuredOrder,
          flightOrder: order,
          status: 'active',
          departureDate: new Date(Date.now() + mf.daysOut * 86400000),
          departureTime: mf.departureTime,
          arrivalTime: mf.arrivalTime,
          duration: mf.duration,
        },
      });
    }
    dbg(
      `Seeded ${manualFlights.length} manual flights (${manualFlights.filter((f) => f.featuredOrder).length} featured)`,
    );

    // ── Manual Hotels & Rooms (10 seeded, 8 featured) ──
    // All Pexels IDs below verified 200 OK AND vision-checked as hotel-context
    // (exterior / lobby / room / pool / dining) before inclusion.
    const manualHotels: Array<{
      name: string;
      slug: string;
      location: string;
      stars: number;
      rating: number;
      discount?: number;
      accommodationType: string;
      description: string;
      latitude: number;
      longitude: number;
      destinationCode: string;
      destinationName: string;
      amenities: string[];
      images: number[];
      email: string;
      phone: string;
      rooms: Array<{
        name: string;
        roomType: string;
        maxAdults: number;
        maxChildren: number;
        basePrice: number;
        image?: number;
        description: string;
      }>;
    }> = [
      {
        name: 'The Ritz-Carlton Dubai International Financial Centre',
        slug: 'ritz-carlton-difc',
        location: 'Dubai International Financial Centre, Dubai, UAE',
        stars: 5,
        rating: 9.2,
        discount: 15,
        accommodationType: 'hotel',
        description:
          "An oasis of refined calm in the heart of DIFC, The Ritz-Carlton pairs residential-style elegance with legendary service. Floor-to-ceiling windows frame Burj Khalifa or skyline views, while the secluded courtyard pool, award-winning spa and Club Lounge offer sanctuary between meetings. Steps from Gate Village galleries and the precinct's finest dining.",
        latitude: 25.2134,
        longitude: 55.2806,
        destinationCode: 'DXB',
        destinationName: 'Dubai',
        amenities: [
          'Free WiFi',
          'Rooftop Pool',
          'Spa & Wellness',
          'Club Lounge',
          'Fine Dining',
          'Fitness Centre',
          'Valet Parking',
          '24h Room Service',
        ],
        images: [261187, 1001965, 2029667, 262047],
        email: 'reservations.difc@ritzcarlton-demo.com',
        phone: '+971 4 372 2222',
        rooms: [
          {
            name: 'Deluxe King Room',
            roomType: 'deluxe',
            maxAdults: 2,
            maxChildren: 1,
            basePrice: 650,
            image: 2029667,
            description:
              '45 sqm with floor-to-ceiling windows, king bed, marble bathroom and city views.',
          },
          {
            name: 'Club Suite',
            roomType: 'suite',
            maxAdults: 3,
            maxChildren: 2,
            basePrice: 1200,
            image: 2079249,
            description:
              '80 sqm corner suite with separate living room, Club Lounge access and Burj Khalifa views.',
          },
          {
            name: 'Financial Centre Residence',
            roomType: 'suite',
            maxAdults: 4,
            maxChildren: 2,
            basePrice: 2100,
            image: 262047,
            description:
              'Two-bedroom residence with dining room, butler service and panoramic skyline terrace.',
          },
        ],
      },
      {
        name: 'Atlantis The Palm',
        slug: 'atlantis-the-palm',
        location: 'Crescent Road, The Palm Jumeirah, Dubai, UAE',
        stars: 5,
        rating: 9.0,
        discount: 20,
        accommodationType: 'resort',
        description:
          "Iconic ocean-themed resort crowning the crescent of Palm Jumeirah. Atlantis The Palm is home to Aquaventure Waterpark, The Lost Chambers Aquarium and over 40 restaurants and bars including celebrity-chef venues. Every one of its 1,544 rooms overlooks the Arabian Gulf or the Palm's skyline, and the private beach stretches for 700 metres.",
        latitude: 25.1305,
        longitude: 55.1172,
        destinationCode: 'DXB',
        destinationName: 'Dubai',
        amenities: [
          'Private Beach',
          'Aquaventure Waterpark',
          'Free WiFi',
          'Infinity Pool',
          'Underwater Aquarium',
          'Spa & Fitness',
          'Kids Club',
          'Airport Transfer',
        ],
        images: [258154, 78126, 262048, 2253643],
        email: 'reservations@atlantisthepalm-demo.com',
        phone: '+971 4 426 0000',
        rooms: [
          {
            name: 'Ocean Deluxe Room',
            roomType: 'deluxe',
            maxAdults: 2,
            maxChildren: 2,
            basePrice: 720,
            image: 262048,
            description:
              '42 sqm with private balcony and uninterrupted views over the Arabian Gulf.',
          },
          {
            name: 'Imperial Ocean Club Suite',
            roomType: 'suite',
            maxAdults: 3,
            maxChildren: 2,
            basePrice: 1450,
            image: 97083,
            description:
              '96 sqm two-room suite on club floors with lounge access and evening canapés.',
          },
        ],
      },
      {
        name: 'Serena Hotel Islamabad',
        slug: 'serena-hotel-islamabad',
        location: 'Khayaban-e-Suhrwardy, Islamabad, Pakistan',
        stars: 5,
        rating: 9.4,
        accommodationType: 'hotel',
        description:
          'Set against the Margalla Hills, Islamabad Serena blends Islamic architecture with contemporary luxury across nine acres of landscaped gardens. Guests return for the Zamana traditional Pakistani restaurant, the outdoor pool framed by mango trees, and a serenity spa. Minutes from Diplomatic Enclave and Faisal Mosque.',
        latitude: 33.7167,
        longitude: 73.0667,
        destinationCode: 'ISB',
        destinationName: 'Islamabad',
        amenities: [
          'Free WiFi',
          'Garden Pool',
          'Serenity Spa',
          '5 Restaurants',
          'Fitness Centre',
          'Business Centre',
          'Airport Shuttle',
          '24h Security',
        ],
        images: [1134176, 2869215, 210604, 262978],
        email: 'reservations.islamabad@serena-hotels-demo.com',
        phone: '+92 51 111 133 133',
        rooms: [
          {
            name: 'Deluxe Garden Room',
            roomType: 'deluxe',
            maxAdults: 2,
            maxChildren: 1,
            basePrice: 260,
            image: 210604,
            description:
              '35 sqm with garden or Margalla Hills view, king or twin beds.',
          },
          {
            name: 'Executive Suite',
            roomType: 'suite',
            maxAdults: 3,
            maxChildren: 2,
            basePrice: 480,
            image: 2029667,
            description:
              '70 sqm suite with living room, work desk and hillside balcony.',
          },
        ],
      },
      {
        name: 'Pearl Continental Karachi',
        slug: 'pearl-continental-karachi',
        location: 'Club Road, Karachi, Pakistan',
        stars: 5,
        rating: 8.7,
        accommodationType: 'hotel',
        description:
          "Karachi's landmark address since 1964, Pearl Continental stands on Club Road minutes from the financial district and Frere Hall. Six restaurants — from Sakura Japanese to Chandni regional cuisine — a lagoon-style pool, tennis courts and one of the city's largest ballrooms make it the default choice for business and celebration alike.",
        latitude: 24.8524,
        longitude: 67.0329,
        destinationCode: 'KHI',
        destinationName: 'Karachi',
        amenities: [
          'Free WiFi',
          'Lagoon Pool',
          '6 Restaurants',
          'Tennis Courts',
          'Business Centre',
          'Spa & Salon',
          'Airport Pickup',
          'Conference Facilities',
        ],
        images: [2119714, 29649745, 271624, 2290753],
        email: 'reservations.pc.khi@hashoogroup-demo.com',
        phone: '+92 21 111 505 505',
        rooms: [
          {
            name: 'Standard Room',
            roomType: 'standard',
            maxAdults: 2,
            maxChildren: 1,
            basePrice: 180,
            image: 271624,
            description: '30 sqm with queen bed, work desk and city view.',
          },
          {
            name: 'Executive Room',
            roomType: 'executive',
            maxAdults: 2,
            maxChildren: 1,
            basePrice: 280,
            image: 164595,
            description:
              '40 sqm with king bed, lounge access and garden-facing balcony.',
          },
          {
            name: 'Presidential Suite',
            roomType: 'suite',
            maxAdults: 4,
            maxChildren: 2,
            basePrice: 550,
            image: 2440471,
            description:
              '120 sqm duplex with two bedrooms, formal dining and sea-facing terrace.',
          },
        ],
      },
      {
        name: 'Avari Hotel Lahore',
        slug: 'avari-hotel-lahore',
        location: 'Fatemeh Jinnah Road, Lahore, Pakistan',
        stars: 4,
        rating: 8.5,
        accommodationType: 'hotel',
        description:
          "On Mall Road in Lahore's cultural heart, Avari puts the Walled City, Anarkali Bazaar and Lahore Museum within ten minutes. The rooftop pool looks out over the old city, Faletti's-style high tea remains a city institution, and versatile halls host everything from Sufi nights to corporate summits.",
        latitude: 31.5586,
        longitude: 74.3267,
        destinationCode: 'LHE',
        destinationName: 'Lahore',
        amenities: [
          'Free WiFi',
          'Rooftop Pool',
          '3 Restaurants',
          'High Tea Lounge',
          'Gym & Sauna',
          'Conference Halls',
          'Airport Transfer',
          'Tour Desk',
        ],
        images: [261169, 3215519, 3201763, 1267360],
        email: 'reservations@avari-lahore-demo.com',
        phone: '+92 42 3630 1777',
        rooms: [
          {
            name: 'Standard Room',
            roomType: 'standard',
            maxAdults: 2,
            maxChildren: 1,
            basePrice: 140,
            image: 3201763,
            description:
              '28 sqm with queen bed, city view and rainfall shower.',
          },
          {
            name: 'Premier Room',
            roomType: 'premier',
            maxAdults: 2,
            maxChildren: 2,
            basePrice: 220,
            image: 271618,
            description:
              '38 sqm with king bed, Mall Road view and evening turndown.',
          },
        ],
      },
      {
        name: 'Hilton Istanbul Bosphorus',
        slug: 'hilton-istanbul-bosphorus',
        location: 'Bayildim Caddesi, Harbiye, Istanbul, Turkey',
        stars: 5,
        rating: 9.1,
        accommodationType: 'hotel',
        description:
          "A landmark in lush gardens above the Bosphorus since 1955, Hilton Istanbul Bosphorus sits between Taksim Square and the Nişantaşı shopping quarter. The Turkish bath, panoramic terrace restaurant and one of Europe's largest hotel pools pair with easy tram access to Sultanahmet's historic sights.",
        latitude: 41.0428,
        longitude: 28.9906,
        destinationCode: 'IST',
        destinationName: 'Istanbul',
        amenities: [
          'Free WiFi',
          'Bosphorus Views',
          'Turkish Bath',
          'Outdoor Pool',
          'Terrace Restaurant',
          'Fitness Centre',
          'Executive Lounge',
          'Pet Friendly',
        ],
        images: [2096983, 5288134, 164595, 2079249],
        email: 'istanbul_bosphorus@hilton-demo.com',
        phone: '+90 212 315 6000',
        rooms: [
          {
            name: 'Bosphorus View King',
            roomType: 'premium',
            maxAdults: 2,
            maxChildren: 1,
            basePrice: 340,
            image: 164595,
            description:
              '40 sqm with balcony overlooking the strait and ships passing below.',
          },
          {
            name: 'Executive Suite',
            roomType: 'suite',
            maxAdults: 3,
            maxChildren: 2,
            basePrice: 520,
            image: 2079249,
            description:
              '55 sqm with lounge access, garden view and marble bathroom.',
          },
        ],
      },
      {
        name: 'Mövenpick Hotel Jeddah',
        slug: 'movenpick-jeddah',
        location: 'Al Madinah Al Munawarah Road, Jeddah, Saudi Arabia',
        stars: 5,
        rating: 8.8,
        accommodationType: 'hotel',
        description:
          'Fifteen minutes from King Abdulaziz Airport and walking distance to Red Sea Mall, Mövenpick Jeddah serves Umrah pilgrims and business travellers with equal care. Swiss service shows in the chocolate hour each afternoon, an acclaimed Levantine kitchen, and serene rooms designed for rest between rituals and meetings.',
        latitude: 21.5433,
        longitude: 39.1728,
        destinationCode: 'JED',
        destinationName: 'Jeddah',
        amenities: [
          'Free WiFi',
          'Outdoor Pool',
          'Levantine Restaurant',
          'Chocolate Hour',
          'Prayer Rooms',
          'Spa & Fitness',
          'Umrah Services',
          'Shuttle to Haram',
        ],
        images: [2034335, 2440471, 1329711, 1457847],
        email: 'reservations.jeddah@movenpick-demo.com',
        phone: '+966 12 651 8888',
        rooms: [
          {
            name: 'Superior King',
            roomType: 'superior',
            maxAdults: 2,
            maxChildren: 1,
            basePrice: 420,
            image: 1329711,
            description:
              '38 sqm with king bed, blackout curtains and city view.',
          },
          {
            name: 'Executive Suite',
            roomType: 'suite',
            maxAdults: 3,
            maxChildren: 2,
            basePrice: 780,
            image: 2440471,
            description:
              '75 sqm with living room, work desk and Red Sea breeze terrace.',
          },
        ],
      },
      {
        name: 'The Savoy London',
        slug: 'the-savoy-london',
        location: 'Strand, Covent Garden, London, United Kingdom',
        stars: 5,
        rating: 9.5,
        discount: 10,
        accommodationType: 'hotel',
        description:
          "London's original grand hotel since 1889, The Savoy occupies an island site on the Strand where the West End meets the Thames. Art-deco suites and Edwardian rooms look over the river or Covent Garden, the American Bar keeps its century-old reputation, and theatreland's stage doors are a stroll away.",
        latitude: 51.5104,
        longitude: -0.12,
        destinationCode: 'LON',
        destinationName: 'London',
        amenities: [
          'Free WiFi',
          'Thames Views',
          'American Bar',
          'Butler Service',
          'River Restaurant',
          'Spa & Gym',
          'Afternoon Tea',
          'Concierge 24h',
        ],
        images: [261102, 1001965, 97083, 342800],
        email: 'reservations@savoy-demo.co.uk',
        phone: '+44 20 7420 2111',
        rooms: [
          {
            name: 'Superior Queen Room',
            roomType: 'superior',
            maxAdults: 2,
            maxChildren: 0,
            basePrice: 850,
            image: 97083,
            description:
              'Elegant Edwardian styling, marble bathroom and Covent Garden aspect.',
          },
          {
            name: 'Thames River Suite',
            roomType: 'suite',
            maxAdults: 3,
            maxChildren: 1,
            basePrice: 1900,
            image: 2029667,
            description:
              'Art-deco suite with floor-to-ceiling windows over the Thames and butler service.',
          },
        ],
      },
      // Non-featured inventory (bookable, not shown on homepage)
      {
        name: 'Marriott Mena House Cairo',
        slug: 'marriott-mena-house-cairo',
        location: 'Pyramids Road, Giza, Cairo, Egypt',
        stars: 5,
        rating: 8.9,
        accommodationType: 'resort',
        description:
          "Wake to the Pyramids of Giza from your private garden at Mena House. This 19th-century palace hotel pairs Mamluk-era craftsmanship — carved screens, chandeliers, hand-painted ceilings — with a golf course at the desert's edge and the Khufu's restaurant serving Egyptian classics under pyramid view.",
        latitude: 29.9773,
        longitude: 31.1342,
        destinationCode: 'CAI',
        destinationName: 'Cairo',
        amenities: [
          'Free WiFi',
          'Pyramid Views',
          'Outdoor Pool',
          'Golf Course',
          'Palace Dining',
          'Spa',
          'Excursion Desk',
          'Airport Shuttle',
        ],
        images: [2506988, 271639],
        email: 'reservations.mena.house@marriott-demo.com',
        phone: '+20 2 3377 3222',
        rooms: [
          {
            name: 'Garden View Room',
            roomType: 'deluxe',
            maxAdults: 2,
            maxChildren: 1,
            basePrice: 310,
            image: 271639,
            description:
              'Ground-floor room opening onto gardens with pyramid glimpses.',
          },
        ],
      },
      {
        name: 'Fairmont Singapore',
        slug: 'fairmont-singapore',
        location: 'Raffles City, Bras Basah Road, Singapore',
        stars: 5,
        rating: 9.3,
        accommodationType: 'hotel',
        description:
          'Connected to Raffles City shopping mall and City Hall MRT, Fairmont Singapore places Orchard Road, Marina Bay and Chinatown within minutes. Its signature Willow Stream Spa spans three floors, and 76 suites offer butler service above the city skyline.',
        latitude: 1.2932,
        longitude: 103.853,
        destinationCode: 'SIN',
        destinationName: 'Singapore',
        amenities: [
          'Free WiFi',
          'Willow Stream Spa',
          'Skyline Views',
          'MRT Connected',
          'Rooftop Pool',
          '16 Restaurants',
          'Fitness Centre',
          'Butler Service',
        ],
        images: [1268855, 1457847],
        email: 'reservations@fairmont-singapore-demo.com',
        phone: '+65 6339 7777',
        rooms: [
          {
            name: 'Fairmont Room',
            roomType: 'deluxe',
            maxAdults: 2,
            maxChildren: 1,
            basePrice: 480,
            image: 1457847,
            description:
              'City-view room with marble bathroom and lounge access option.',
          },
        ],
      },
    ];

    const featuredSlugs = new Set([
      'ritz-carlton-difc',
      'atlantis-the-palm',
      'serena-hotel-islamabad',
      'pearl-continental-karachi',
      'avari-hotel-lahore',
      'hilton-istanbul-bosphorus',
      'movenpick-jeddah',
      'the-savoy-london',
    ]);

    let featuredIdx = 0;
    for (const mh of manualHotels) {
      const isFeatured = featuredSlugs.has(mh.slug);
      const hotelOrder = isFeatured ? ++featuredIdx : 99;
      const images = mh.images.map((id, i) => ({
        url: px(id),
        isDefault: i === 0,
      }));
      const hotel = await this.prisma.manualHotel.upsert({
        where: { slug: mh.slug },
        create: {
          name: mh.name,
          slug: mh.slug,
          status: 'active',
          featured: isFeatured,
          hotelOrder,
          stars: mh.stars,
          rating: mh.rating,
          discount: mh.discount ?? null,
          accommodationType: mh.accommodationType,
          description: mh.description,
          currency: 'USD',
          refundable: true,
          checkinTime: '14:00',
          checkoutTime: '12:00',
          location: mh.location,
          latitude: mh.latitude,
          longitude: mh.longitude,
          destinationCode: mh.destinationCode,
          destinationName: mh.destinationName,
          images,
          amenities: mh.amenities,
          email: mh.email,
          phone: mh.phone,
          cancellationPolicy:
            "Free cancellation up to 48 hours before check-in. Late cancellations incur one night's charge.",
          metaTitle: `${mh.name} — Book Direct | TravelsOTA`,
          metaDesc: mh.description.slice(0, 155),
          metaKeywords: `${mh.destinationName}, ${mh.stars} star hotel, luxury stay, book hotel`,
        },
        update: {
          name: mh.name,
          description: mh.description,
          images,
          featured: isFeatured,
          hotelOrder,
          stars: mh.stars,
          rating: mh.rating,
          discount: mh.discount ?? null,
          accommodationType: mh.accommodationType,
          amenities: mh.amenities,
          email: mh.email,
          phone: mh.phone,
          status: 'active',
          currency: 'USD',
          cancellationPolicy:
            "Free cancellation up to 48 hours before check-in. Late cancellations incur one night's charge.",
          metaTitle: `${mh.name} — Book Direct | TravelsOTA`,
          metaDesc: mh.description.slice(0, 155),
        },
      });

      for (const room of mh.rooms) {
        await this.prisma.manualHotelRoom.upsert({
          where: {
            id: `seed-mhr-${mh.slug}-${room.name.replace(/\s+/g, '-').toLowerCase()}`,
          },
          create: {
            id: `seed-mhr-${mh.slug}-${room.name.replace(/\s+/g, '-').toLowerCase()}`,
            hotelId: hotel.id,
            name: room.name,
            roomType: room.roomType,
            description: room.description,
            maxAdults: room.maxAdults,
            maxChildren: room.maxChildren,
            basePrice: room.basePrice,
            currency: 'USD',
            status: 'active',
            breakfastIncluded: true,
            refundable: true,
            availableQuantity: 5,
            images: room.image
              ? [{ url: px(room.image), isDefault: true }]
              : [],
          },
          update: {
            basePrice: room.basePrice,
            description: room.description,
            images: room.image
              ? [{ url: px(room.image), isDefault: true }]
              : [],
            status: 'active',
          },
        });
      }
    }
    dbg(
      `Seeded ${manualHotels.length} manual hotels with rooms (${featuredIdx} featured)`,
    );

    // ── Currencies ──
    const currencies: Array<{
      code: string;
      symbol: string;
      name: string;
      isDefault?: boolean;
      isBase?: boolean;
      exchangeRate: number;
    }> = [
      {
        code: 'USD',
        symbol: '$',
        name: 'US Dollar',
        isDefault: true,
        isBase: true,
        exchangeRate: 1,
      },
      { code: 'EUR', symbol: '€', name: 'Euro', exchangeRate: 0.92 },
      { code: 'GBP', symbol: '£', name: 'British Pound', exchangeRate: 0.79 },
      {
        code: 'PKR',
        symbol: '₨',
        name: 'Pakistani Rupee',
        exchangeRate: 278.5,
      },
      { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', exchangeRate: 3.67 },
      { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', exchangeRate: 3.75 },
      { code: 'INR', symbol: '₹', name: 'Indian Rupee', exchangeRate: 83.1 },
      {
        code: 'BDT',
        symbol: '৳',
        name: 'Bangladeshi Taka',
        exchangeRate: 109.5,
      },
    ];
    for (const c of currencies) {
      await this.prisma.currency.upsert({
        where: { code: c.code },
        create: { ...c, isActive: true },
        update: {
          exchangeRate: c.exchangeRate,
          symbol: c.symbol,
          name: c.name,
        },
      });
    }
    dbg('Seeded 8 currencies');

    // ── Languages ──
    const languages: Array<{
      code: string;
      name: string;
      direction: string;
      isDefault?: boolean;
    }> = [
      { code: 'en', name: 'English', direction: 'LTR', isDefault: true },
      { code: 'ar', name: 'العربية', direction: 'RTL' },
      { code: 'fr', name: 'Français', direction: 'LTR' },
    ];
    for (const l of languages) {
      await this.prisma.language.upsert({
        where: { code: l.code },
        create: { ...l, isActive: true },
        update: { name: l.name, direction: l.direction },
      });
    }
    dbg('Seeded 3 languages');

    // ── Commission Tiers ──
    const tiers: Array<{
      name: string;
      description: string;
      commissionRate: number;
      minMonthlyBookings: number;
      isDefault?: boolean;
    }> = [
      {
        name: 'Basic',
        description: 'Entry-level agent tier',
        commissionRate: 3,
        minMonthlyBookings: 0,
        isDefault: true,
      },
      {
        name: 'Silver',
        description: '10+ bookings/month',
        commissionRate: 5,
        minMonthlyBookings: 10,
      },
      {
        name: 'Gold',
        description: '50+ bookings/month',
        commissionRate: 8,
        minMonthlyBookings: 50,
      },
    ];
    for (const t of tiers) {
      await this.prisma.commissionTier.upsert({
        where: { name: t.name },
        create: {
          ...t,
          flightCommissionRate: t.commissionRate,
          hotelCommissionRate: t.commissionRate + 2,
        },
        update: { commissionRate: t.commissionRate },
      });
    }
    dbg('Seeded 3 commission tiers');

    // ── Markup Rules ──
    const markups: Array<{
      name: string;
      type: string;
      applyTo: string;
      markupType: string;
      markupValue: number;
      priority: number;
      isActive: boolean;
    }> = [
      {
        name: 'Default Flight Markup',
        type: 'default',
        applyTo: 'flights',
        markupType: 'percentage',
        markupValue: 5,
        priority: 0,
        isActive: true,
      },
      {
        name: 'Default Hotel Markup',
        type: 'default',
        applyTo: 'hotels',
        markupType: 'percentage',
        markupValue: 10,
        priority: 0,
        isActive: true,
      },
      {
        name: 'DXB Route Premium',
        type: 'route',
        applyTo: 'flights',
        markupType: 'percentage',
        markupValue: 8,
        priority: 10,
        isActive: true,
      },
    ];
    for (const m of markups) {
      await this.prisma.markupRule.create({ data: m });
    }
    dbg('Seeded 3 markup rules');

    // ── Commission Rules ──
    const commissions: Array<{
      name: string;
      type: string;
      rate: number;
      applyTo: string;
      minAmount?: number;
      isActive: boolean;
      priority: number;
    }> = [
      {
        name: 'Standard Commission',
        type: 'default',
        rate: 5,
        applyTo: 'all',
        isActive: true,
        priority: 0,
      },
      {
        name: 'High-Value Booking',
        type: 'threshold',
        rate: 8,
        applyTo: 'all',
        minAmount: 1000,
        isActive: true,
        priority: 5,
      },
      {
        name: 'New Agent Promo',
        type: 'promotional',
        rate: 3,
        applyTo: 'all',
        isActive: true,
        priority: 2,
      },
    ];
    for (const c of commissions) {
      await this.prisma.commissionRule.create({ data: c });
    }
    dbg('Seeded 3 commission rules');

    // ── Cancellation Fee Rules ──
    const cancelRules: Array<{
      name: string;
      type: string;
      applyTo: string;
      fee: number;
      hoursSinceBooking?: number;
      isActive: boolean;
    }> = [
      {
        name: 'Free 24h Cancellation',
        type: 'time_based',
        applyTo: 'all',
        fee: 0,
        hoursSinceBooking: 24,
        isActive: true,
      },
      {
        name: 'Partial Refund (24-72h)',
        type: 'time_based',
        applyTo: 'all',
        fee: 30,
        hoursSinceBooking: 72,
        isActive: true,
      },
      {
        name: 'No-Show Fee',
        type: 'fixed',
        applyTo: 'all',
        fee: 100,
        isActive: true,
      },
    ];
    for (const c of cancelRules) {
      await this.prisma.cancellationFeeRule.create({ data: c });
    }
    dbg('Seeded 3 cancellation fee rules');

    // ── Promo Codes ──
    const promos: Array<{
      code: string;
      name: string;
      description: string;
      status: string;
      discountType: string;
      discountValueMinor: number;
      discountPercentBps?: number;
      customerType: string;
      startsAt: Date;
      endsAt: Date;
    }> = [
      {
        code: 'SUMMER20',
        name: 'Summer Sale 20%',
        description: '20% off all flight bookings',
        status: 'ACTIVE',
        discountType: 'PERCENTAGE',
        discountValueMinor: 0,
        discountPercentBps: 2000,
        customerType: 'ALL',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 90 * 86400000),
      },
      {
        code: 'WELCOME10',
        name: 'Welcome Discount',
        description: '10% off for new customers on first booking',
        status: 'ACTIVE',
        discountType: 'PERCENTAGE',
        discountValueMinor: 0,
        discountPercentBps: 1000,
        customerType: 'CUSTOMER',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 180 * 86400000),
      },
      {
        code: 'HOTEL15',
        name: 'Hotel Special 15%',
        description: '15% off all hotel bookings',
        status: 'ACTIVE',
        discountType: 'PERCENTAGE',
        discountValueMinor: 0,
        discountPercentBps: 1500,
        customerType: 'ALL',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 60 * 86400000),
      },
      {
        code: 'WINTER2025',
        name: 'Winter 2025 Promo',
        description: '25% off — expired campaign',
        status: 'EXPIRED',
        discountType: 'PERCENTAGE',
        discountValueMinor: 0,
        discountPercentBps: 2500,
        customerType: 'ALL',
        startsAt: new Date(Date.now() - 120 * 86400000),
        endsAt: new Date(Date.now() - 30 * 86400000),
      },
    ];
    for (const p of promos) {
      await this.prisma.promoCode.upsert({
        where: { code: p.code },
        create: {
          ...p,
          productTypes: ['flights', 'hotels'],
          isPublic: true,
          version: 1,
          status: p.status as PromoCodeStatus,
          discountType: p.discountType as any,
          customerType: p.customerType as any,
        },
        update: { status: p.status as PromoCodeStatus, endsAt: p.endsAt },
      });
    }
    dbg('Seeded 4 promo codes');

    // ── Email Rules ──
    const emailRuleTypes = [
      'booking.flight.created',
      'booking.hotel.created',
      'booking.confirmed',
      'booking.failed',
      'booking.cancelled',
      'payment.failed',
      'refund.completed',
      'invoice.ready',
      'demo.credentials',
      'demo.verify.email',
      'admin.demo.lead',
      'test.email',
    ];
    for (const type of emailRuleTypes) {
      await this.prisma.emailRule.upsert({
        where: { type },
        create: {
          type,
          enabled: true,
          sendToCustomer: true,
          sendToAdmin: true,
          sendToRoles: [],
          critical: type.includes('failed'),
        },
        update: { enabled: true },
      });
    }
    dbg('Seeded 12 email rules');

    // ── Notification Rules ──
    const notificationRuleTypes: Array<{
      type: string;
      severity: string;
      category: string;
      critical: boolean;
    }> = [
      {
        type: 'booking.flight.created',
        severity: 'info',
        category: 'bookings',
        critical: false,
      },
      {
        type: 'booking.hotel.created',
        severity: 'info',
        category: 'bookings',
        critical: false,
      },
      {
        type: 'booking.confirmed',
        severity: 'success',
        category: 'bookings',
        critical: false,
      },
      {
        type: 'booking.failed',
        severity: 'error',
        category: 'bookings',
        critical: true,
      },
      {
        type: 'booking.cancelled',
        severity: 'warning',
        category: 'bookings',
        critical: false,
      },
      {
        type: 'payment.succeeded',
        severity: 'success',
        category: 'payments',
        critical: false,
      },
      {
        type: 'payment.failed',
        severity: 'error',
        category: 'payments',
        critical: true,
      },
      {
        type: 'refund.completed',
        severity: 'info',
        category: 'payments',
        critical: false,
      },
    ];
    for (const n of notificationRuleTypes) {
      await this.prisma.notificationRule.upsert({
        where: { type: n.type },
        create: {
          type: n.type,
          severity: n.severity,
          category: n.category,
          critical: n.critical,
          enabled: true,
        },
        update: { severity: n.severity, enabled: true },
      });
    }

    // Assign super_admin and admin roles to all notification rules
    const roles = await this.prisma.role.findMany({
      where: { name: { in: ['super_admin', 'admin'] } },
    });
    const rules = await this.prisma.notificationRule.findMany();
    for (const role of roles) {
      for (const rule of rules) {
        await this.prisma.notificationRuleRole.upsert({
          where: { ruleId_roleId: { ruleId: rule.id, roleId: role.id } },
          create: { ruleId: rule.id, roleId: role.id },
          update: {},
        });
      }
    }
    dbg('Seeded 8 notification rules + role assignments');

    // ── Document Templates ──
    const templates = [
      {
        name: 'Standard Invoice',
        type: 'invoice',
        isDefault: true,
        description: 'Standard invoice template with line items and totals',
        content: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:40px}.header{border-bottom:2px solid #033d4a;padding-bottom:16px;margin-bottom:24px}.header h1{color:#033d4a;font-size:24px;margin:0}.meta{font-size:12px;color:#64748b;margin-top:4px}table{width:100%;border-collapse:collapse;margin:16px 0}th{background:#f1f5f9;text-align:left;padding:10px 12px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}td{padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0}.totals{text-align:right;margin-top:24px}.totals p{margin:4px 0;font-size:14px}.totals .grand{font-size:18px;font-weight:700;color:#033d4a}.footer{font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:32px}</style></head><body><div class="header"><h1>INVOICE</h1><div class="meta">Invoice #: INV-{{invoiceNumber}} | Date: {{issueDate}} | Due: {{dueDate}}</div></div><div><p><strong>Bill To:</strong><br>{{customerName}}<br>{{customerAddress}}</p></div><table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>{{lineItems}}</tbody></table><div class="totals"><p>Subtotal: {{subtotal}}</p><p>Tax ({{taxRate}}%): {{taxAmount}}</p><p class="grand">Total: {{total}}</p></div><div class="footer"><p>TravelsOTA — Travel Booking Platform | Tax ID: {{taxId}}<br>Payment Terms: {{paymentTerms}} | Please include invoice number with payment</p></div></body></html>`,
      },
      {
        name: 'Booking Confirmation',
        type: 'booking_confirmation',
        isDefault: true,
        description: 'Booking confirmation with itinerary and traveler details',
        content: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:40px}.header{background:#033d4a;color:#fff;padding:24px;text-align:center;border-radius:8px}.header h1{font-size:22px;margin:0}.ref{font-size:12px;color:rgba(255,255,255,.7);margin-top:4px}table{width:100%;border-collapse:collapse;margin:16px 0}th{background:#f1f5f9;text-align:left;padding:10px 12px;font-size:12px;color:#64748b;text-transform:uppercase}td{padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0}.footer{font-size:11px;color:#94a3b8;text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0}</style></head><body><div class="header"><h1>Booking Confirmed</h1><div class="ref">Reference: {{bookingRef}} | Booked: {{bookedDate}}</div></div><h3>Traveler Information</h3><p>{{travelerName}} | {{travelerEmail}} | {{travelerPhone}}</p><h3>Itinerary</h3><table><thead><tr><th>Segment</th><th>Flight</th><th>Date</th><th>Departure</th><th>Arrival</th><th>Class</th></tr></thead><tbody>{{segments}}</tbody></table><h3>Booking Details</h3><table><thead><tr><th>Item</th><th>Details</th></tr></thead><tbody><tr><td>Booking Reference</td><td>{{bookingRef}}</td></tr><tr><td>Status</td><td><span style="color:#10b981;font-weight:700">CONFIRMED</span></td></tr><tr><td>Payment</td><td>{{paymentMethod}} — {{paymentAmount}}</td></tr><tr><td>Cancellation</td><td>{{cancellationPolicy}}</td></tr></tbody></table><div class="footer"><p>TravelsOTA — Travel Booking Platform<br>For changes or cancellations, visit travelsota.com/my-bookings or contact support@travelsota.com</p></div></body></html>`,
      },
      {
        name: 'Payment Receipt',
        type: 'receipt',
        isDefault: true,
        description: 'Payment receipt with transaction details',
        content: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:40px}.header{border-left:4px solid #10b981;padding-left:16px;margin-bottom:24px}.header h1{font-size:22px;color:#10b981;margin:0}.header p{font-size:13px;color:#64748b;margin:4px 0}table{width:100%;border-collapse:collapse;margin:16px 0}th{background:#f1f5f9;text-align:left;padding:10px 12px;font-size:12px;color:#64748b;text-transform:uppercase}td{padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0}.total{font-size:18px;font-weight:700;color:#10b981;text-align:right;margin-top:16px}.footer{font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px}</style></head><body><div class="header"><h1>PAYMENT RECEIPT</h1><p>Receipt #: {{receiptNumber}} | Date: {{paymentDate}}</p></div><table><thead><tr><th>Description</th><th>Details</th></tr></thead><tbody><tr><td>Booking Reference</td><td>{{bookingRef}}</td></tr><tr><td>Payment Method</td><td>{{paymentMethod}}</td></tr><tr><td>Transaction ID</td><td>{{transactionId}}</td></tr><tr><td>Gateway</td><td>{{gateway}}</td></tr><tr><td>Currency</td><td>{{currency}}</td></tr></tbody></table><p class="total">Amount Paid: {{amount}}</p><div class="footer"><p>TravelsOTA — Travel Booking Platform<br>This is a computer-generated receipt. For questions, contact support@travelsota.com</p></div></body></html>`,
      },
    ];

    for (const tpl of templates) {
      await this.prisma.documentTemplate.upsert({
        where: { id: `seed-dt-${tpl.type}` },
        create: { ...tpl, id: `seed-dt-${tpl.type}`, isActive: true },
        update: { content: tpl.content, name: tpl.name },
      });
    }
    dbg('Seeded 3 document templates');

    // ── Audit Logs ── (25 sample entries)
    const adminUser = await this.prisma.user.findUnique({
      where: { email: this.config.demo.adminEmail },
    });
    const auditActions = [
      {
        action: 'create',
        entity: 'User',
        description: 'Created new staff user',
        ip: '192.168.1.100',
      },
      {
        action: 'update',
        entity: 'Role',
        description: 'Assigned permissions to super_admin role',
        ip: '192.168.1.100',
      },
      {
        action: 'create',
        entity: 'FlightBooking',
        description: 'Manually created booking EK623-DXB-LHR',
        ip: '192.168.1.101',
      },
      {
        action: 'update',
        entity: 'ProviderConfig',
        description: 'Updated Travelport credentials',
        ip: '192.168.1.100',
      },
      {
        action: 'update',
        entity: 'PaymentGatewayConfig',
        description: 'Enabled Stripe gateway',
        ip: '192.168.1.100',
      },
      {
        action: 'approve',
        entity: 'AgentProfile',
        description: 'Approved agent registration — Demo Agency',
        ip: '192.168.1.100',
      },
      {
        action: 'cancel',
        entity: 'HotelBooking',
        description: 'Cancelled booking HBS-000045',
        ip: '192.168.1.102',
      },
      {
        action: 'update',
        entity: 'MarkupRule',
        description: 'Set default flight markup to 5%',
        ip: '192.168.1.100',
      },
      {
        action: 'login',
        entity: 'User',
        description: 'Admin login successful',
        ip: '192.168.1.100',
      },
      {
        action: 'create',
        entity: 'PromoCode',
        description: 'Created promo code SUMMER20',
        ip: '192.168.1.100',
      },
      {
        action: 'update',
        entity: 'CommissionTier',
        description: 'Updated Gold tier commission to 8%',
        ip: '192.168.1.100',
      },
      {
        action: 'delete',
        entity: 'User',
        description: 'Soft-deleted inactive customer account',
        ip: '192.168.1.100',
      },
      {
        action: 'update',
        entity: 'Currency',
        description: 'Updated PKR exchange rate to 278.5',
        ip: '192.168.1.100',
      },
      {
        action: 'create',
        entity: 'NotificationRule',
        description: 'Created notification rule for booking.failed',
        ip: '192.168.1.100',
      },
      {
        action: 'update',
        entity: 'Settings',
        description: 'Set cancellation fee to 30% for 24-72h window',
        ip: '192.168.1.100',
      },
      {
        action: 'refund',
        entity: 'Payment',
        description: 'Processed full refund for booking PAY-FLT-7A3B',
        ip: '192.168.1.103',
      },
      {
        action: 'login_failed',
        entity: 'User',
        description: 'Failed login attempt for user@example.com',
        ip: '203.0.113.42',
      },
      {
        action: 'create',
        entity: 'BlogCategory',
        description: 'Created blog category: Travel Tips',
        ip: '192.168.1.100',
      },
      {
        action: 'publish',
        entity: 'BlogPost',
        description: 'Published blog post: Airport Mistakes Guide',
        ip: '192.168.1.100',
      },
      {
        action: 'create',
        entity: 'CmsPage',
        description: 'Created CMS page: Terms of Service',
        ip: '192.168.1.100',
      },
      {
        action: 'update',
        entity: 'ManualFlight',
        description: 'Updated PK-301 pricing and availability',
        ip: '192.168.1.100',
      },
      {
        action: 'toggle',
        entity: 'ProviderConfig',
        description: 'Toggled Hotelbeds provider enabled',
        ip: '192.168.1.100',
      },
      {
        action: 'export',
        entity: 'Report',
        description: 'Exported monthly revenue report as CSV',
        ip: '192.168.1.100',
      },
      {
        action: 'bulk_update',
        entity: 'FlightBooking',
        description: 'Bulk updated 12 flight booking statuses',
        ip: '192.168.1.100',
      },
      {
        action: 'review',
        entity: 'AgentProfile',
        description: 'Reviewed agent KYC documents — approved',
        ip: '192.168.1.100',
      },
    ];

    for (let i = 0; i < auditActions.length; i++) {
      const a = auditActions[i];
      const daysAgo = Math.floor(Math.random() * 90);
      await this.prisma.auditLog.create({
        data: {
          userId: adminUser?.id ?? null,
          action: a.action,
          entity: a.entity,
          entityId: `seed-audit-${i + 1}`,
          description: a.description,
          ipAddress: a.ip,
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
          createdAt: new Date(Date.now() - daysAgo * 86400000),
        },
      });
    }
    dbg('Seeded 25 audit log entries');
  }

  private async createDemoAccounts() {
    const config = this.config.demo;
    const superAdminRole = await this.prisma.role.findUnique({
      where: { name: 'super_admin' },
    });
    if (!superAdminRole)
      throw new Error('super_admin role not found after seed');

    // Use static credentials from env — no random generation. Same passwords every cycle.
    const adminPassword = config.adminPassword;
    const agentPassword = config.agentPassword;
    const userPassword = config.userPassword;

    // Admin account (STAFF with super_admin role)
    const adminHash = await bcrypt.hash(adminPassword, 12);
    await this.prisma.user.upsert({
      where: { email: config.adminEmail },
      create: {
        email: config.adminEmail,
        passwordHash: adminHash,
        firstName: 'Demo',
        lastName: 'Admin',
        userType: 'STAFF',
        status: 'ACTIVE',
        emailVerified: true,
        roleId: superAdminRole.id,
      },
      update: {
        passwordHash: adminHash,
        userType: 'STAFF',
        status: 'ACTIVE',
        deletedAt: null,
        emailVerified: true,
        roleId: superAdminRole.id,
        credentialsVersion: { increment: 1 },
      },
    });
    dbg(`Demo admin account: ${config.adminEmail} / ${adminPassword}`);

    // Agent account (AGENT with agent profile).
    // NOTE: roleId MUST be set in both branches — an agent user without a role
    // has zero effective permissions (PermissionCheckService) and every agent
    // booking/search call is rejected with PERMISSION_DENIED.
    const agentHash = await bcrypt.hash(agentPassword, 12);
    const agentRole =
      (await this.prisma.role.findUnique({
        where: { name: 'premium_agent' },
      })) ??
      (await this.prisma.role.findUnique({ where: { name: 'basic_agent' } }));
    if (!agentRole) {
      throw new Error(
        'Neither premium_agent nor basic_agent role found — cannot create demo agent',
      );
    }
    const agentUser = await this.prisma.user.upsert({
      where: { email: config.agentEmail },
      create: {
        email: config.agentEmail,
        passwordHash: agentHash,
        firstName: 'Demo',
        lastName: 'Agent',
        userType: 'AGENT',
        status: 'ACTIVE',
        emailVerified: true,
        roleId: agentRole.id,
      },
      update: {
        passwordHash: agentHash,
        userType: 'AGENT',
        status: 'ACTIVE',
        deletedAt: null,
        emailVerified: true,
        roleId: agentRole.id,
        credentialsVersion: { increment: 1 },
      },
    });

    await this.prisma.agentProfile.upsert({
      where: { userId: agentUser.id },
      create: {
        userId: agentUser.id,
        creditLimit: 10000,
        commissionRate: 5,
        flightMarkup: 2,
        hotelMarkup: 3,
        companyName: 'Demo Agency',
        isApproved: true,
        kycStatus: 'APPROVED',
      },
      update: {
        creditLimit: 10000,
        commissionRate: 5,
        flightMarkup: 2,
        hotelMarkup: 3,
        isApproved: true,
        kycStatus: 'APPROVED',
      },
    });
    dbg(`Demo agent account: ${config.agentEmail} / ${agentPassword}`);

    // Customer account (CUSTOMER)
    const userHash = await bcrypt.hash(userPassword, 12);
    await this.prisma.user.upsert({
      where: { email: config.userEmail },
      create: {
        email: config.userEmail,
        passwordHash: userHash,
        firstName: 'Demo',
        lastName: 'User',
        userType: 'CUSTOMER',
        status: 'ACTIVE',
        emailVerified: true,
      },
      update: {
        passwordHash: userHash,
        userType: 'CUSTOMER',
        status: 'ACTIVE',
        deletedAt: null,
        emailVerified: true,
        credentialsVersion: { increment: 1 },
      },
    });
    dbg(`Demo user account: ${config.userEmail} / ${userPassword}`);

    // Persist current credentials so the demo form returns the live set, not env defaults
    // ponytail: delete old rows first — prevents stale creds lingering after a rename
    await this.prisma.demoCredential.deleteMany();
    await this.prisma.demoCredential.create({
      data: {
        adminEmail: config.adminEmail,
        adminPassword,
        agentEmail: config.agentEmail,
        agentPassword,
        userEmail: config.userEmail,
        userPassword,
      },
    });
    dbg('Current demo credentials persisted to DemoCredential table');
  }

  /**
   * On startup (not during reset), ensure demo accounts exist without destroying data.
   * This handles the first deploy where no demo users exist yet.
   */
  async ensureDemoAccountsExist() {
    try {
      const superAdminExists = await this.prisma.role.findUnique({
        where: { name: 'super_admin' },
      });
      if (!superAdminExists) {
        dbg('No roles found — running full seed');
        await this.seedAllData();
      }
      await this.createDemoAccounts();
      await this.ensureRealAdmin();
      dbg('Demo accounts verified on startup');
    } catch (err) {
      this.logger.error(
        `Failed to ensure demo accounts: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Create or reactivate the real super admin account. */
  private async ensureRealAdmin() {
    // Env-driven so deployments control their own real admin account.
    // Falls back to the original default when unset.
    const REAL_ADMIN_EMAIL =
      process.env.REAL_ADMIN_EMAIL || 'superadmin@travelsota-dev.local';
    const REAL_ADMIN_PASSWORD = process.env.REAL_ADMIN_PASSWORD || 'ChangeMeDev123!';

    const superAdminRole = await this.prisma.role.findUnique({
      where: { name: 'super_admin' },
    });
    if (!superAdminRole) {
      dbg('super_admin role not found — retrying in 2s');
      return;
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: REAL_ADMIN_EMAIL },
    });
    const passwordHash = await bcrypt.hash(REAL_ADMIN_PASSWORD, 12);

    if (existing) {
      // Restore if soft-deleted or inactive
      if (existing.deletedAt || existing.status !== 'ACTIVE') {
        await this.prisma.user.update({
          where: { email: REAL_ADMIN_EMAIL },
          data: {
            passwordHash,
            status: 'ACTIVE',
            deletedAt: null,
            userType: 'STAFF',
            roleId: superAdminRole.id,
            emailVerified: true,
            credentialsVersion: { increment: 1 },
          },
        });
        dbg(`Real admin account reactivated: ${REAL_ADMIN_EMAIL}`);
        return;
      }
      // Update password in case it was changed
      await this.prisma.user.update({
        where: { email: REAL_ADMIN_EMAIL },
        data: { passwordHash },
      });
      dbg(`Real admin password reset: ${REAL_ADMIN_EMAIL}`);
      return;
    }

    await this.prisma.user.create({
      data: {
        email: REAL_ADMIN_EMAIL,
        passwordHash,
        firstName: 'Super',
        lastName: 'Admin',
        userType: 'STAFF',
        status: 'ACTIVE',
        emailVerified: true,
        roleId: superAdminRole.id,
      },
    });
    dbg(`Real admin account created: ${REAL_ADMIN_EMAIL}`);
  }

  getStatus() {
    const config = this.config.demo;
    const intervalLabel =
      config.resetIntervalMinutes > 0
        ? `${config.resetIntervalMinutes}m`
        : `${config.resetIntervalHours}h`;
    return {
      lastReset: this.lastReset?.toISOString() ?? null,
      nextResetInterval: intervalLabel,
      enabled: config.resetEnabled,
      logs: this.resetLogs.slice(-30),
    };
  }

  private addLog(msg: string) {
    const ts = new Date().toISOString().slice(11, 19);
    this.resetLogs.push(`[${ts}] ${msg}`);
    if (this.resetLogs.length > 200) this.resetLogs.shift();
  }
}
