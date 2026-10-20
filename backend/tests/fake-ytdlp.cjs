#!/usr/bin/env node
const { createReadStream, appendFileSync } = require('node:fs');
const { spawn } = require('node:child_process');
if (process.argv.includes('--version')) { console.log('test-engine'); process.exit(0); }
if (process.env.VIDFETCH_TEST_PID_LOG) appendFileSync(process.env.VIDFETCH_TEST_PID_LOG, `${process.pid}\n`);
if (process.argv.includes('--dump-json')) {
  if (process.env.VIDFETCH_TEST_METADATA_MODE === 'youtube-bot-check') {
    // Exact stderr captured on the OVH VPS on 13 Oct 2026 (yt-dlp 2026.08.19, engine flags, unauthenticated).
    process.stderr.write(require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/youtube-bot-check.stderr')));
    process.exit(1);
  }
  if (process.env.VIDFETCH_TEST_METADATA_MODE === 'hang') {
    setInterval(() => {}, 1000); return;
  }
  console.log(JSON.stringify({ id: 'aqz-KE-bpKQ', title: 'fixture', formats: [{ format_id: '18', ext: 'mp4', url: 'https://example.com/media.mp4', vcodec: 'h264', acodec: 'aac' }] }));
  process.exit(0);
}
let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', async () => {
  const raw = JSON.parse(input), mode = raw.test_mode || 'normal';
  if (mode === 'hang') { setInterval(() => {}, 1000); return; }
  if (mode === 'empty') return;
  if (mode === 'descendant') {
    const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {},1000)'], { stdio: 'ignore' });
    if (process.env.VIDFETCH_TEST_PID_LOG) appendFileSync(process.env.VIDFETCH_TEST_PID_LOG, `${descendant.pid}\n`);
    process.stdout.write(Buffer.alloc(65536, 7)); setInterval(() => {}, 1000); return;
  }
  if (raw.test_file) { createReadStream(raw.test_file).pipe(process.stdout); return; }
  const size = raw.test_size || 2 * 1024 * 1024;
  let sent = 0;
  while (sent < size) {
    const chunk = Buffer.alloc(Math.min(16384, size - sent), 7);
    if (!process.stdout.write(chunk)) await new Promise(resolve => process.stdout.once('drain', resolve));
    sent += chunk.length;
    if (mode === 'slow' || mode === 'fail') await new Promise(resolve => setTimeout(resolve, 10));
    if (mode === 'fail' && sent >= 65536) { process.stderr.write('source failed\n'); process.exit(7); }
  }
});
