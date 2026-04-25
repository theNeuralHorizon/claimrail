/**
 * Audit log with a Merkle-style hash chain.
 *
 * Each appended event stores:
 *   prev_hash  = the row_hash of the most recent event in the same org
 *   row_hash   = sha256(id || orgId || actorId || action || resource ||
 *                       resourceId || metadata || created_at || prev_hash)
 *
 * `verifyAuditChain(orgId)` walks the org's events in order and returns
 * the first index whose row_hash doesn't match. Anything mutated or
 * deleted in the middle shows up here.
 *
 * This is *detection*, not *prevention* — a sufficiently motivated DB
 * admin with write access can rewrite the chain. Real compliance would
 * periodically sign `tip_hash` with a KMS key or anchor it on-chain. That's
 * well beyond this project's scope, but the primitive is in place.
 */
import { createHash } from 'node:crypto';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema';
import { desc, eq, asc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface AppendAuditEvent {
  orgId: string;
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

function hashRow(fields: {
  id: string;
  orgId: string;
  actorId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadataJson: string | null;
  seq: number;
  createdAt: number;
  prevHash: string | null;
}): string {
  const parts = [
    fields.id,
    fields.orgId,
    fields.actorId ?? '',
    fields.action,
    fields.resource,
    fields.resourceId ?? '',
    fields.metadataJson ?? '',
    String(fields.seq),
    String(fields.createdAt),
    fields.prevHash ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export async function appendAuditEvent(evt: AppendAuditEvent): Promise<void> {
  const id = nanoid(16);
  const createdAt = Math.floor(Date.now() / 1000);
  const metadataJson = evt.metadata ? JSON.stringify(evt.metadata) : null;

  const prev = await db
    .select({ rowHash: auditEvents.rowHash, seq: auditEvents.seq })
    .from(auditEvents)
    .where(eq(auditEvents.orgId, evt.orgId))
    .orderBy(desc(auditEvents.seq))
    .limit(1)
    .then((r) => r[0]);
  const prevHash = prev?.rowHash ?? null;
  const seq = (prev?.seq ?? 0) + 1;

  const rowHash = hashRow({
    id,
    orgId: evt.orgId,
    actorId: evt.actorId ?? null,
    action: evt.action,
    resource: evt.resource,
    resourceId: evt.resourceId ?? null,
    metadataJson,
    seq,
    createdAt,
    prevHash,
  });

  await db
    .insert(auditEvents)
    .values({
      id,
      orgId: evt.orgId,
      actorId: evt.actorId ?? null,
      action: evt.action,
      resource: evt.resource,
      resourceId: evt.resourceId ?? null,
      metadataJson,
      seq,
      prevHash,
      rowHash,
      createdAt,
    })
    ;
}

export interface AuditVerifyResult {
  ok: boolean;
  checked: number;
  brokenAtIndex?: number;
  brokenRowId?: string;
}

export async function verifyAuditChain(orgId: string): Promise<AuditVerifyResult> {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(asc(auditEvents.seq))
    ;
  let lastHash: string | null = null;
  let lastSeq = 0;
  let hashChainStarted = false;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    // Legacy rows prior to the hash-chain introduction have no rowHash;
    // skip them but reset lastHash so the first hashed row must have prev=null.
    if (!r.rowHash) {
      lastHash = null;
      lastSeq = r.seq;
      continue;
    }
    // Sequence must be strictly increasing — otherwise a row was deleted.
    if (hashChainStarted && r.seq !== lastSeq + 1) {
      return { ok: false, checked: i, brokenAtIndex: i, brokenRowId: r.id };
    }
    if ((r.prevHash ?? null) !== lastHash) {
      return { ok: false, checked: i, brokenAtIndex: i, brokenRowId: r.id };
    }
    const expected = hashRow({
      id: r.id,
      orgId: r.orgId,
      actorId: r.actorId ?? null,
      action: r.action,
      resource: r.resource,
      resourceId: r.resourceId ?? null,
      metadataJson: r.metadataJson ?? null,
      seq: r.seq,
      createdAt: r.createdAt,
      prevHash: r.prevHash ?? null,
    });
    if (expected !== r.rowHash) {
      return { ok: false, checked: i, brokenAtIndex: i, brokenRowId: r.id };
    }
    lastHash = r.rowHash;
    lastSeq = r.seq;
    hashChainStarted = true;
  }
  return { ok: true, checked: rows.length };
}

// Exported for the sql import to be considered used if we ever need raw SQL.
export { sql };

// Export for unit tests.
export const __TEST_ONLY = { hashRow };
