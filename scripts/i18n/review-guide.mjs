// Manual editorial confirmation only; never called by builds, deployments or tests.
import { record, save, today, hashBody } from './editorial.mjs';
const args = process.argv.slice(2), option = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const locale = option('locale'), id = option('id'), reviewer = option('reviewer');
if (!locale || locale === 'en' || !id || !reviewer?.trim() || !args.includes('--confirm-linguistic-review') || !args.includes('--confirm-technical-review')) throw Error('Provide locale, id, named reviewer and both confirmations after completing the review');
const guide = await record(locale, id), original = await record('en', id);
if (guide.meta.sourceBodySha256 !== hashBody(original.body)) throw Error('The source changed: revise the translation and its provenance first');
if (guide.body.trim().split(/\s+/).length < 250) throw Error('Incomplete translation');
guide.meta.status = 'ready';
guide.meta.review = { linguistic: 'approved', technical: 'approved', reviewer: reviewer.trim(), reviewedAt: today() };
guide.meta.updated = today();
await save(guide);
console.log('Review recorded with backup. Publication date unchanged; review the Git diff and test. No push or deployment.');
