import { request } from 'node:http';
import { writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:8788';
const results = { started: new Date().toISOString(), tests: {} };
const cases = [
  ['healthMethod', '/api/health', { method: 'POST' }, 405],
  ['infoMethod', '/api/fetch-info', { method: 'GET' }, 405],
  ['downloadMethod', '/api/download', { method: 'PUT' }, 405],
  ['unknownStatus', '/api/download?status=unknown', {}, 404],
  ['unknownTicket', '/api/download?ticket=unknown', {}, 404],
  ['origin', '/api/health', { headers: { Origin: 'https://example.com' } }, 403],
];
try {
  for (const [name, path, options, expected] of cases) {
    const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    results.tests[name] = { http: response.status, expected, code: body.code, ok: response.status === expected };
  }
  results.tests.host = await new Promise((resolve, reject) => {
    const req = request(base + '/api/health', { headers: { Host: 'invalid.example' }, timeout: 5000 }, response => { response.resume(); resolve({ http: response.statusCode, expected: 400, ok: response.statusCode === 400 }); });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout'))); req.end();
  });
  results.tests.slowBody = await new Promise((resolve, reject) => {
    const started = Date.now();
    const req = request(base + '/api/fetch-info', { method: 'POST', timeout: 15000 }, response => {
      const chunks = []; response.on('data', c => chunks.push(c));
      response.on('end', () => { const body = JSON.parse(Buffer.concat(chunks).toString()); resolve({ http: response.statusCode, expected: 504, code: body.code, elapsedMs: Date.now() - started, ok: response.statusCode === 504 }); });
      req.end();
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout'))); req.write('{');
  });
  if (Object.values(results.tests).some(test => !test.ok)) process.exitCode = 1;
} catch (error) { results.failure = error.code || error.message; process.exitCode = 1; }
finally {
  await writeFile('pi-http-extra.json', JSON.stringify(results, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(results));
}
