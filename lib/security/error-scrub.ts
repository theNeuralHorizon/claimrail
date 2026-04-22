/**
 * Error scrubber for API responses.
 *
 * Never ship a stack trace or internal error message to a user. Return a
 * correlation ID (logged server-side) so a support engineer can match the
 * user report to a log line without the user having to ever see the raw
 * error.
 */

import { nanoid } from 'nanoid';
import { safeForLog } from './sanitize';

export interface ErrorEnvelope {
  correlationId: string;
  message: string;
}

/**
 * Convert any thrown value into a user-safe envelope + log the real
 * details on the server side.
 */
export function scrubError(
  err: unknown,
  context: { route?: string; userId?: string | null } = {},
): ErrorEnvelope {
  const correlationId = `cr_${nanoid(12)}`;
  const raw = err instanceof Error ? err.message : String(err ?? 'unknown');
  const stack = err instanceof Error ? err.stack : undefined;
  // eslint-disable-next-line no-console
  console.error(
    `[error ${correlationId}] route=${safeForLog(context.route ?? '')} user=${safeForLog(context.userId ?? '')} msg=${safeForLog(raw)}${stack ? `\n${stack}` : ''}`,
  );
  return {
    correlationId,
    message:
      process.env.NODE_ENV === 'production'
        ? `Something went wrong. Reference ${correlationId}.`
        : `${raw} (ref ${correlationId})`,
  };
}
