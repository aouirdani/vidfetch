import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
export const today = () => new Date().toISOString().slice(0, 10);
export const hashBody = body => createHash('sha256').update(body.trim()).digest('hex');
export async function record(locale, id) {
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw Error('Invalid locale or article identifier');
  const registered = (await readdir('src/i18n/messages')).map(name => name.replace(/\.json$/, ''));
  if (!registered.includes(locale)) throw Error('Unregistered dictionary');
  const path = resolve('content/guides', ...(locale === 'en' ? [] : [locale]), id + '.md');
  const source = await readFile(path, 'utf8'), match = /^---\n([\s\S]+?)\n---\n([\s\S]+)$/.exec(source);
  if (!match) throw Error('Invalid guide frontmatter');
  return { path, source, meta: JSON.parse(match[1]), body: match[2] };
}
export async function save(record) {
  const backup = resolve('backend/backups', `editorial-${Date.now()}-${randomUUID()}`);
  await mkdir(backup, { recursive: true, mode: 0o700 });
  await writeFile(backup + '/before.md', record.source, { flag: 'wx', mode: 0o600 });
  const temp = record.path + '.' + randomUUID() + '.tmp';
  await writeFile(temp, '---\n' + JSON.stringify(record.meta, null, 2) + '\n---\n' + record.body, { flag: 'wx' });
  await rename(temp, record.path);
}
export function assertReviewed(meta, locale) {
  if (meta.status !== 'ready') throw Error('Guide is not approved');
  if (locale !== 'en' && (meta.review?.linguistic !== 'approved' || meta.review?.technical !== 'approved' || !meta.review?.reviewer?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(meta.review?.reviewedAt ?? '') || meta.review.reviewedAt > today())) throw Error('Explicit human review is required');
}
