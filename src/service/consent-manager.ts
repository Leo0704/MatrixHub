import { getDb } from './db.js';

interface ConsentRecord {
  granted: boolean;
  grantedAt?: string;
  version: string;
}

const CONSENT_VERSION = '1.0.0';

export class ConsentManager {
  async isConsentRequired(): Promise<boolean> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM consent WHERE version = ?').get(CONSENT_VERSION) as { granted: number } | undefined;
    return !row || row.granted !== 1;
  }

  async grantConsent(): Promise<void> {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO consent (version, granted, grantedAt)
      VALUES (?, 1, datetime('now'))
    `).run(CONSENT_VERSION);
  }

  async getConsentRecord(): Promise<ConsentRecord | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM consent WHERE version = ?').get(CONSENT_VERSION) as { granted: number; grantedAt: string } | undefined;
    if (!row) return null;
    return {
      granted: row.granted === 1,
      grantedAt: row.grantedAt,
      version: CONSENT_VERSION,
    };
  }
}
