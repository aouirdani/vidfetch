// Run manually only after confirming the guides are actually public.
import { readdir } from 'node:fs/promises';
import { record, save, today, assertReviewed, hashBody } from '../i18n/editorial.mjs';
if (!process.argv.includes('--confirmed-publication')) throw Error('Confirm actual public publication first. This command does not deploy or push.');
const args = process.argv.slice(2), option = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const locale = option('locale') ?? 'en', selected = option('id');
const ids = selected ? [selected] : (await readdir('content/guides')).filter(file => file.endsWith('.md')).map(file => file.slice(0, -3));
const plans = [];
for (const id of ids) {
  const guide = await record(locale, id); assertReviewed(guide.meta, locale);
  if (guide.meta.created > today()) throw Error('Future guide');
  if (locale !== 'en' && guide.meta.sourceBodySha256 !== hashBody((await record('en', id)).body)) throw Error('Translation source changed');
  if (guide.meta.published) continue;
  guide.meta.published = today(); guide.meta.updated = today(); plans.push(guide);
}
// Validate every selected guide before writing. Each change gets a distinct backup.
for (const guide of plans) await save(guide);
console.log('Publication dates recorded. Review and test the resulting Git diff; nothing was pushed.');
