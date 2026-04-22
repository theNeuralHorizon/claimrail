/**
 * Dev-mode email delivery — logs the link to stdout and returns it in the
 * action state so the user can click through without a real SMTP provider.
 *
 * In production, swap this with a real provider (Resend, Postmark, SES).
 * The interface is already in the shape providers expect: `to` + subject +
 * text body.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📧 Email (dev console)\n` +
      `To:      ${payload.to}\n` +
      `Subject: ${payload.subject}\n\n` +
      `${payload.text}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`,
  );
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  );
}
