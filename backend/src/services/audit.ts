import crypto from 'node:crypto';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Deterministically serialize any object with keys recursively sorted.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${canonicalJson(val)}`;
  });
  return `{${entries.join(',')}}`;
}

/**
 * Compute SHA256(prevHash + canonical_json(row))
 */
export function computeAuditHash(
  prevHash: string,
  row: {
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    payload: unknown;
    ts: Date | string;
  }
): string {
  const tsString = row.ts instanceof Date ? row.ts.toISOString() : new Date(row.ts).toISOString();
  const canonicalData = canonicalJson({
    actorId: row.actorId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    payload: row.payload,
    ts: tsString,
  });

  return crypto
    .createHash('sha256')
    .update(prevHash + canonicalData)
    .digest('hex');
}
