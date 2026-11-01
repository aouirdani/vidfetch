import { DatabaseSync } from "node:sqlite";
import { AccessError } from "../../src/server/access-crypto";

export type LedgerLimits = { identityOps: number; globalOps: number; identityBytes: number; globalBytes: number; requestsPerMinute: number; workPerTenMinutes: number; grantsPerMinute: number };

/** No URLs, cookies or raw IPs. Reservations survive a crash conservatively. */
export class GatewayLedger {
  private db: DatabaseSync;
  private readonly limits: LedgerLimits;
  constructor(file: string, limits: Partial<LedgerLimits> = {}) {
    this.limits = { identityOps: 8, globalOps: 100, identityBytes: 1024 ** 3, globalBytes: 4 * 1024 ** 3, requestsPerMinute: 120, workPerTenMinutes: 20, grantsPerMinute: 10, ...limits };
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS counters(k TEXT PRIMARY KEY,n INTEGER NOT NULL,b INTEGER NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS proofs(k TEXT PRIMARY KEY,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS metrics(day TEXT NOT NULL,name TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(day,name))");
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
    const cutoff=new Date(Math.floor(now/86400000)*86400000-90*86400000).toISOString().slice(0,10);
    this.db.prepare("DELETE FROM metrics WHERE day<?").run(cutoff);
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
  reserve(ip: string, owner: string, initialBytes: number, maximumBytes=initialBytes, now = Date.now()) {
    if (!Number.isSafeInteger(initialBytes) || !Number.isSafeInteger(maximumBytes) || initialBytes < 0 || maximumBytes < initialBytes) throw new Error("Invalid quota reservation");
    const day = Math.floor(now / 86400000), expires = (day + 1) * 86400000;
    const keys = [`daily:ip:${ip}:${day}`, `daily:owner:${owner}:${day}`, `daily:global:${day}`];
    let reserved = initialBytes;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (let index = 0; index < keys.length; index++) {
        const current = this.counter(keys[index], expires);
        const quota = index === 2 ? this.limits.globalBytes : this.limits.identityBytes;
        if (current.n >= (index === 2 ? this.limits.globalOps : this.limits.identityOps) || current.b + initialBytes > quota) throw new AccessError("QUOTA_EXCEEDED", 429);
        this.db.prepare("UPDATE counters SET n=n+1,b=b+? WHERE k=?").run(initialBytes, keys[index]);
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    let settled = false;
    const settle = (actualBytes: number) => {
      if (settled) return;
      settled = true;
      const unused = reserved - Math.max(0, Math.min(reserved, actualBytes));
      for (const key of keys) this.db.prepare("UPDATE counters SET b=MAX(0,b-?) WHERE k=?").run(unused, key);
    };
    const reservation=Object.assign(settle, { extend: (neededBytes: number) => {
      if (settled || neededBytes <= reserved) return !settled;
      if (!Number.isSafeInteger(neededBytes) || neededBytes > maximumBytes) return false;
      const extra = neededBytes - reserved;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        for (let index = 0; index < keys.length; index++) {
          const current = this.counter(keys[index], expires), quota = index === 2 ? this.limits.globalBytes : this.limits.identityBytes;
          if (current.b + extra > quota) throw new AccessError("QUOTA_EXCEEDED", 429);
        }
        for (const key of keys) this.db.prepare("UPDATE counters SET b=b+? WHERE k=?").run(extra,key);
        this.db.exec("COMMIT"); reserved = neededBytes; return true;
      } catch { this.db.exec("ROLLBACK"); return false; }
    }});
    Object.defineProperty(reservation,"reservedBytes",{get:()=>reserved,enumerable:true});
    return reservation as typeof reservation & { reservedBytes:number };
  }
  snapshot(now = Date.now()) {
    const day = Math.floor(now / 86400000);
    const row = this.db.prepare("SELECT n,b FROM counters WHERE k=?").get(`daily:global:${day}`) as {n:number;b:number}|undefined;
    const date = new Date(day * 86400000).toISOString().slice(0,10);
    const metrics = Object.fromEntries((this.db.prepare("SELECT name,n FROM metrics WHERE day=?").all(date) as Array<{name:string;n:number}>).map(x=>[x.name,x.n]));
    return { day: date, operations: row?.n ?? 0, bytes: row?.b ?? 0, limits: { operations: this.limits.globalOps, bytes: this.limits.globalBytes }, metrics };
  }
  get config() { return { ...this.limits }; }
  metric(name: "requests"|"quota_rejected"|"busy_or_unavailable"|"other_errors", now=Date.now()) {
    const day=new Date(Math.floor(now/86400000)*86400000).toISOString().slice(0,10);
    this.db.prepare("INSERT INTO metrics(day,name,n) VALUES(?,?,1) ON CONFLICT(day,name) DO UPDATE SET n=n+1").run(day,name);
  }
  close() { this.db.close(); }
}
