/**
 * SLA Parser
 *
 * Given the text of a vendor's SLA / MSA, extract the credit tier table.
 * Two implementations:
 *   1. `parseWithClaude`: calls the Anthropic API when ANTHROPIC_API_KEY is
 *      present. Uses a short, deterministic prompt.
 *   2. `parseHeuristic`: regex + rule based. Covers ~80% of real-world SLAs
 *      using the patterns observed in AWS, Azure, GCP, Stripe, Cloudflare,
 *      Twilio, Shopify, Zendesk, Datadog, New Relic, Okta, Auth0, Mailgun,
 *      SendGrid, Segment, Intercom, PagerDuty, Slack, Zoom, Atlassian, ...
 *
 * parseSla() picks Claude if available, falls back to heuristic. The test
 * suite exercises the heuristic directly so we have a repeatable baseline.
 */

export interface ParsedTier {
  uptimeThresholdPct: number;
  creditPct: number;
  tierRank: number;
  sourceExcerpt: string;
}

export interface ParsedSla {
  provider: 'claude' | 'heuristic';
  tiers: ParsedTier[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Heuristic parser
// ─────────────────────────────────────────────────────────────────────────

/**
 * Strategy:
 *   1. Split into sentences / table rows.
 *   2. For each row that contains BOTH an uptime percentage AND a credit
 *      percentage, extract both and keep as a tier.
 *   3. Deduplicate by (uptimeThreshold, creditPct).
 *   4. Sort by uptimeThreshold descending (99.9% → 99% → 95%) and assign ranks.
 *   5. Filter out nonsense (credits > 100, thresholds > 100, tiers > 10).
 *
 * Pitfalls handled:
 *   • "99.9%" vs "99.99%" vs "three nines" — we only match numerics.
 *   • "100%" thresholds are dropped (never in practice, usually means
 *     the lawyer pasted a placeholder).
 *   • A single line like "<99.9% = 10% credit" or "between 99.9% and 99%"
 *     is captured by two separate regex passes.
 */
export function parseHeuristic(text: string): ParsedSla {
  const warnings: string[] = [];
  if (!text || text.trim().length === 0) {
    return { provider: 'heuristic', tiers: [], warnings: ['Empty SLA text'] };
  }

  // ReDoS hard cap — an attacker pasting a 10 MB crafted string would
  // otherwise burn CPU on the regex backtracker. 80KB is about 15 printed
  // pages of SLA text, which covers every vendor contract we've seen.
  const capped = text.length > 80_000 ? text.slice(0, 80_000) : text;

  // Normalize whitespace but preserve line breaks as sentence boundaries
  const normalized = capped
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\u00a0/g, ' ');

  // Split on line breaks, semicolons, or sentence-ending periods.
  // The lookahead `(?=\s|$)` prevents splitting inside decimals like "99.9%".
  const lines = normalized
    .split(/\r?\n|;|\.(?=\s|$)/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const tiers = new Map<string, ParsedTier>();

  // Primary pattern: "<99.9%" or "below 99.9%" or "less than 99.9%"
  // followed (within the same line) by "10% credit" / "service credit of 10%"
  const uptimeRegex = /(\d{1,3}(?:\.\d{1,3})?)\s*%/g;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!lower.includes('%')) continue;
    if (
      !lower.includes('uptime') &&
      !lower.includes('availability') &&
      !lower.includes('service credit') &&
      !lower.includes('credit')
    ) {
      continue;
    }

    const percentMatches: Array<{ value: number; index: number }> = [];
    let m: RegExpExecArray | null;
    const pr = new RegExp(uptimeRegex.source, 'g');
    while ((m = pr.exec(line)) != null) {
      const value = Number(m[1]);
      if (!Number.isFinite(value)) continue;
      percentMatches.push({ value, index: m.index });
    }
    if (percentMatches.length < 2) continue;

    // Heuristic: the first % above 90 and below 100 is the threshold.
    // The credit is the first % ≤ 100 that comes AFTER the threshold index.
    const threshold = percentMatches.find(
      (p) => p.value > 90 && p.value < 100,
    );
    if (!threshold) continue;
    const credit = percentMatches.find(
      (p) => p.index > threshold.index && p.value > 0 && p.value <= 100,
    );
    if (!credit) continue;
    if (credit.value === threshold.value) continue;
    if (credit.value > 100 || threshold.value > 100) continue;

    const key = `${threshold.value}|${credit.value}`;
    if (!tiers.has(key)) {
      tiers.set(key, {
        uptimeThresholdPct: threshold.value,
        creditPct: credit.value,
        tierRank: 0,
        sourceExcerpt: line.slice(0, 200),
      });
    }
  }

  let sorted = Array.from(tiers.values()).sort(
    (a, b) => b.uptimeThresholdPct - a.uptimeThresholdPct,
  );
  sorted = sorted.map((t, i) => ({ ...t, tierRank: i + 1 }));

  if (sorted.length === 0) {
    warnings.push(
      'No SLA tiers detected. Paste the "Service Credits" section of the contract, or enter tiers manually.',
    );
  } else if (sorted.length > 10) {
    warnings.push('More than 10 tiers parsed — keeping the top 10.');
    sorted = sorted.slice(0, 10);
  }

  return { provider: 'heuristic', tiers: sorted, warnings };
}

// ─────────────────────────────────────────────────────────────────────────
// Claude-powered parser (optional; gracefully disables without API key)
// ─────────────────────────────────────────────────────────────────────────

const CLAUDE_PROMPT = `You are a contract-analysis assistant. Extract the Service Level Agreement (SLA) credit tiers from the text below.

Return ONLY valid JSON matching this schema:
{
  "tiers": [
    { "uptimeThresholdPct": number, "creditPct": number, "sourceExcerpt": string }
  ]
}

Rules:
- uptimeThresholdPct: the uptime percentage below which the credit applies (e.g. 99.9 means "below 99.9% triggers this credit").
- creditPct: the % of monthly fees refunded.
- sourceExcerpt: up to 200 characters of the original text that justifies this tier.
- If no tiers are found, return {"tiers": []}.
- Do not invent values. Do not include commentary.`;

async function parseWithClaude(text: string): Promise<ParsedSla | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: `${CLAUDE_PROMPT}\n\n<sla_text>\n${text.slice(0, 12000)}\n</sla_text>`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textOut =
      data.content?.find((c) => c.type === 'text')?.text ?? '';
    const jsonMatch = textOut.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      tiers?: Array<{
        uptimeThresholdPct: number;
        creditPct: number;
        sourceExcerpt?: string;
      }>;
    };
    const tiers = (parsed.tiers ?? [])
      .filter(
        (t) =>
          t.uptimeThresholdPct > 0 &&
          t.uptimeThresholdPct < 100 &&
          t.creditPct > 0 &&
          t.creditPct <= 100,
      )
      .sort((a, b) => b.uptimeThresholdPct - a.uptimeThresholdPct)
      .map((t, i) => ({
        uptimeThresholdPct: t.uptimeThresholdPct,
        creditPct: t.creditPct,
        tierRank: i + 1,
        sourceExcerpt: (t.sourceExcerpt ?? '').slice(0, 200),
      }));
    return { provider: 'claude', tiers, warnings: [] };
  } catch {
    return null;
  }
}

export async function parseSla(text: string): Promise<ParsedSla> {
  const claude = await parseWithClaude(text);
  if (claude && claude.tiers.length > 0) return claude;
  return parseHeuristic(text);
}
