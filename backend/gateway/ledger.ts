import { DatabaseSync } from "node:sqlite";
import { AccessError } from "../../src/server/access-crypto";

/** No URLs, cookies or raw IPs. Reservations survive a crash conservatively. */
export class GatewayLedger {
  private db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS counters(k TEXT PRIMARY KEY,n INTEGER NOT NULL,b INTEGER NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS proofs(k TEXT PRIMARY KEY,expires INTEGER NOT NULL)");
  }
  private counter(key: string, expiry: number): { n: number; b: number } {
    const existing = this.db.prepare("SELECT n,b FROM counters WHERE k=?").get(key) as { n: number; b: number } | undefined;
    if (existing) return existing;
    const capacity = this.db.prepare("SELECT COUNT(*) AS count FROM counters").get() as { count: number };
    if (capacity.count >= 8192) throw new AccessError("BUSY",429);
    this.db.prepare("INSERT OR IGNORE INTO counters VALUES(?,0,0,?)").run(key, expiry);
    return this.db.prepare("SELECT n,b FROM counters WHERE k=?").get(key) as { n: number; b: number };
  }
  prune(now = Date.now()) {
    this.db.prepare("DELETE FROM counters WHERE expires<=?").run(now);
    this.db.prepare("DELETE FROM proofs WHERE expires<=?").run(now);
  }
  rate(identity: string, scope: string, maximum: number, windowMs: number, now = Date.now()) {
    this.prune(now);
    const slot = Math.floor(now / windowMs), key = `rate:${identity}:${scope}:${slot}`;
    const counter = this.counter(key, (slot + 1) * windowMs);
    if (counter.n >= maximum) throw new AccessError("RATE_LIMITED", 429);
    this.db.prepare("UPDATE counters SET n=n+1 WHERE k=?").run(key);
  }
  useProof(owner: string, nonce: string, now = Date.now()) {
    this.prune(now);
    const rows = this.db.prepare("SELECT COUNT(*) AS count FROM proofs").get() as { count: number };
    if (rows.count >= 8192) throw new AccessError("BUSY", 429);
    try { this.db.prepare("INSERT INTO proofs VALUES(?,?)").run(`${owner}:${nonce}`, now + 90000); }
    catch { throw new AccessError("REPLAYED_PROOF"); }
  }
  reserve(ip: string, owner: string, maximumBytes: number, now = Date.now()) {
    const day = Math.floor(now / 86400000), expires = (day + 1) * 86400000;
    const keys = [`daily:ip:${ip}:${day}`, `daily:owner:${owner}:${day}`, `daily:global:${day}`];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (let index = 0; index < keys.length; index++) {
        const current = this.counter(keys[index], expires);
        const quota = index === 2 ? 4 * 1024 ** 3 : 1024 ** 3;
        if (current.n >= (index === 2 ? 100 : 8) || current.b + maximumBytes > quota) throw new AccessError("QUOTA_EXCEEDED", 429);
        this.db.prepare("UPDATE counters SET n=n+1,b=b+? WHERE k=?").run(maximumBytes, keys[index]);
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    let settled = false;
    return (actualBytes: number) => {
      if (settled) return;
      settled = true;
      const unused = maximumBytes - Math.max(0, Math.min(maximumBytes, actualBytes));
      for (const key of keys) this.db.prepare("UPDATE counters SET b=MAX(0,b-?) WHERE k=?").run(unused, key);
    };
  }
  close() { this.db.close(); }
}
