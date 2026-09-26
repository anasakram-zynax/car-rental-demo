const BRAND = {
  primary: '#033d4a',
  primaryLight: '#0a5c6c',
  accent: '#06b6d4',
  surface: '#f8fafc',
  surfaceDark: '#0f172a',
  text: '#1e293b',
  textMuted: '#64748b',
  textLight: '#94a3b8',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  success: '#10b981',
  successBg: '#ecfdf5',
  error: '#ef4444',
  errorBg: '#fef2f2',
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  info: '#3b82f6',
  infoBg: '#eff6ff',
};

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface BaseEmailData {
  supportEmail?: string;
  manageBookingUrl?: string;
}

export function baseEmailWrapper(content: string, data: BaseEmailData = {}): string {
  const supportEmail = data.supportEmail ?? 'support@travelsota.com';
  const manageUrl = data.manageBookingUrl ?? 'https://travelsota.com/my-bookings';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:${BRAND.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.surface};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND.primary};padding:20px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;">TravelsOTA</h1>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;color:rgba(255,255,255,0.6);letter-spacing:0.05em;text-transform:uppercase;">Travel Booking</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:0;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:32px;border-top:1px solid ${BRAND.border};background-color:${BRAND.surface};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:13px;color:${BRAND.text};font-weight:600;">Need help?</p>
                    <p style="margin:0 0 16px;font-size:13px;color:${BRAND.textMuted};">
                      Our support team is available 24/7. <a href="mailto:${esc(supportEmail)}" style="color:${BRAND.accent};text-decoration:none;font-weight:500;">${esc(supportEmail)}</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:${BRAND.primary};border-radius:8px;">
                          <a href="${esc(manageUrl)}" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">Manage Your Bookings</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:11px;color:${BRAND.textLight};text-align:center;">
                &copy; ${new Date().getFullYear()} TravelsOTA. All rights reserved. This is a transactional email regarding your booking.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Premium Design Helpers ──────────────────────────────────────────

/** Full-width hero banner with icon, title, and subtitle */
export function heroBanner(opts: {
  title: string;
  subtitle: string;
  bgColor: string;
  icon: string;
  titleColor?: string;
}): string {
  const titleColor = opts.titleColor ?? '#ffffff';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${opts.bgColor};">
    <tr>
      <td style="padding:40px 32px 32px;text-align:center;">
        <p style="margin:0 0 12px;font-size:36px;">${opts.icon}</p>
        <h2 style="margin:0 0 8px;font-size:26px;font-weight:800;color:${titleColor};letter-spacing:-0.03em;">${esc(opts.title)}</h2>
        <p style="margin:0;font-size:14px;color:${titleColor === '#ffffff' ? 'rgba(255,255,255,0.85)' : BRAND.textMuted};line-height:1.5;">${esc(opts.subtitle)}</p>
      </td>
    </tr>
  </table>`;
}

/** CTA button — centered, branded */
export function ctaButton(href: string, label: string, style?: 'primary' | 'success' | 'danger'): string {
  const colors = {
    primary: BRAND.primary,
    success: BRAND.success,
    danger: BRAND.error,
  };
  const bg = colors[style ?? 'primary'];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background-color:${bg};border-radius:10px;">
              <a href="${esc(href)}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:-0.01em;">${esc(label)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

/** Info callout box (blue tip, green success, yellow warning, red alert) */
export function infoCallout(opts: {
  title: string;
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
}): string {
  const variants = {
    info: { bg: BRAND.infoBg, border: BRAND.info, title: '#1e40af', icon: 'ℹ️' },
    success: { bg: BRAND.successBg, border: BRAND.success, title: '#065f46', icon: '✅' },
    warning: { bg: BRAND.warningBg, border: BRAND.warning, title: '#92400e', icon: '⚠️' },
    error: { bg: BRAND.errorBg, border: BRAND.error, title: '#991b1b', icon: '🚨' },
  };
  const v = variants[opts.variant ?? 'info'];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td style="background-color:${v.bg};border-left:4px solid ${v.border};border-radius:0 8px 8px 0;padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${v.title};">${v.icon} ${esc(opts.title)}</p>
        <p style="margin:0;font-size:13px;color:${BRAND.text};line-height:1.5;">${esc(opts.message)}</p>
      </td>
    </tr>
  </table>`;
}

/** Section heading inside the email body */
export function sectionHeading(title: string): string {
  return `<h3 style="margin:24px 0 12px;font-size:15px;font-weight:700;color:${BRAND.text};letter-spacing:-0.01em;text-transform:uppercase;">${esc(title)}</h3>`;
}

/** Booking detail card — two-column key/value table with subtle background */
export function bookingDetailCard(rows: Array<{ label: string; value: string; highlight?: boolean }>): string {
  const rowHtml = rows.map((r) => {
    const valueStyle = r.highlight
      ? `font-size:16px;font-weight:700;color:${BRAND.primary};`
      : `font-size:14px;font-weight:500;color:${BRAND.text};`;
    return `<tr>
      <td style="padding:10px 0;font-size:13px;color:${BRAND.textMuted};white-space:nowrap;vertical-align:top;">${esc(r.label)}</td>
      <td style="padding:10px 0 10px 20px;${valueStyle}">${esc(r.value)}</td>
    </tr>`;
  }).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;padding:4px 20px;">
    ${rowHtml}
  </table>`;
}

/** Price breakdown row */
export function priceRow(label: string, value: string, opts?: { bold?: boolean; muted?: boolean; last?: boolean }): string {
  const borderBottom = opts?.last ? '' : `border-bottom:1px solid ${BRAND.borderLight};`;
  const labelStyle = opts?.muted ? `color:${BRAND.textLight};` : `color:${BRAND.textMuted};`;
  const valueStyle = opts?.bold
    ? `font-size:18px;font-weight:800;color:${BRAND.primary};`
    : `font-size:14px;font-weight:500;color:${BRAND.text};`;
  return `<tr>
    <td style="padding:12px 0;${borderBottom}${labelStyle}font-size:14px;">${esc(label)}</td>
    <td align="right" style="padding:12px 0;${borderBottom}${valueStyle}">${esc(value)}</td>
  </tr>`;
}

/** Timeline step (numbered circle + text) */
export function timelineStep(step: number, title: string, description: string, isLast?: boolean): string {
  const borderStyle = isLast ? '' : `border-left:2px solid ${BRAND.border};`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="36" valign="top" style="padding:0 12px 0 0;${borderStyle}">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td width="32" height="32" style="background-color:${BRAND.primary};border-radius:50%;text-align:center;vertical-align:middle;">
              <span style="font-size:13px;font-weight:700;color:#ffffff;line-height:32px;">${step}</span>
            </td>
          </tr>
        </table>
      </td>
      <td valign="top" style="padding:4px 0 20px;">
        <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:${BRAND.text};">${esc(title)}</p>
        <p style="margin:0;font-size:13px;color:${BRAND.textMuted};line-height:1.5;">${esc(description)}</p>
      </td>
    </tr>
  </table>`;
}

/** Horizontal rule with generous spacing */
export function sectionDivider(): string {
  return `<hr style="border:none;border-top:1px solid ${BRAND.border};margin:28px 0;" />`;
}

/** Legacy detailRow for backward compatibility */
export function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:${BRAND.textMuted};white-space:nowrap;">${esc(label)}</td>
    <td style="padding:8px 0 8px 16px;font-size:13px;color:${BRAND.text};font-weight:500;">${esc(value)}</td>
  </tr>`;
}

/** Legacy statusBadge for backward compatibility */
export function statusBadge(status: string): string {
  const colorMap: Record<string, string> = {
    confirmed: BRAND.success,
    booked: BRAND.success,
    sent: BRAND.success,
    pending: BRAND.warning,
    failed: BRAND.error,
    cancelled: BRAND.error,
    'in progress': BRAND.primary,
  };
  const color = colorMap[status.toLowerCase()] ?? BRAND.textMuted;
  return `<span style="display:inline-block;padding:4px 12px;border-radius:9999px;font-size:13px;font-weight:600;color:#ffffff;background-color:${color};text-transform:uppercase;letter-spacing:0.05em;">${esc(status)}</span>`;
}

export { BRAND, esc };
