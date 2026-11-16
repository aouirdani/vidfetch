import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

export async function withSite(run) {
  let child, browser, base = process.env.VIDFETCH_UI_BASE_URL;
  try {
    if (base) {
      const url = new URL(base);
      assert.ok(url.origin === 'https://vidfetch.app' || ['localhost', '127.0.0.1'].includes(url.hostname));
      base = url.origin;
    } else {
      const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
      const port = reserve.address().port; await new Promise(done => reserve.close(done));
      base = `http://127.0.0.1:${port}`;
      child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' }, detached: true, stdio: 'ignore' });
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
        if (child.exitCode !== null) break;
        await delay(250);
      }
      assert.ok(ready, 'production build starts');
    }
    browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
    await run({ browser, base });
  } finally {
    await browser?.close();
    if (child?.exitCode === null) {
      process.kill(-child.pid, 'SIGTERM');
      await Promise.race([once(child, 'exit'), delay(5000)]);
      if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL');
    }
  }
}
