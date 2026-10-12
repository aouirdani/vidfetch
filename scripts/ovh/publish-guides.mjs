// Run manually only after confirming the guides are actually public.
import { readFile, writeFile, readdir } from 'node:fs/promises';
if (!process.argv.includes('--confirmed-publication')) throw Error('Confirm actual public publication first. This command does not deploy or push.');
const today = new Date().toISOString().slice(0, 10);
for (const file of await readdir('content/guides')) {
  if (!file.endsWith('.md')) continue;
  const path = 'content/guides/' + file, source = await readFile(path, 'utf8');
  const match = /^---\n([\s\S]+?)\n---\n([\s\S]+)$/.exec(source);
  const metadata = JSON.parse(match[1]);
  if (metadata.status !== 'ready' || metadata.created > today) throw Error('Unreviewed or future guide');
  if (metadata.published) continue;
  metadata.published = today; metadata.updated = today;
  await writeFile(path, '---\n' + JSON.stringify(metadata, null, 2) + '\n---\n' + match[2]);
}
console.log('Publication dates recorded. Review and test the resulting Git diff; nothing was pushed.');
