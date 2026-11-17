import assert from 'node:assert/strict';
const title = 'Contrôles complets en échec';
const repository = process.env.GITHUB_REPOSITORY;
assert.match(repository ?? '', /^[\w.-]+\/[\w.-]+$/);
const checks = Object.entries(JSON.parse(process.env.CHECK_RESULTS)).filter(([name]) => name !== 'clock');
const failed = checks.filter(([, value]) => value.result !== 'success');
async function api(path, method = 'GET', data) {
  const response = await fetch(`https://api.github.com${path}`, { method, headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.ok(response.ok, `GitHub issue update failed: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const found = await api(`/search/issues?q=${encodeURIComponent(`repo:${repository} is:issue in:title "${title}"`)}`);
const issue = found.items.find(i => i.title === title);
const url = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const body = `Dernière exécution : [contrôles complets](${url})\nCommit : ${process.env.GITHUB_SHA}\n\n${checks.map(([name, value]) => `- ${name} : ${value.result}`).join('\n')}\n\nCes contrôles ne bloquent pas la production. Les corrections passent par preflight puis un push normal sur main.`;
if (failed.length) {
  if (issue) await api(`/repos/${repository}/issues/${issue.number}`, 'PATCH', { body, state: 'open' });
  else await api(`/repos/${repository}/issues`, 'POST', { title, body });
} else if (issue?.state === 'open') {
  await api(`/repos/${repository}/issues/${issue.number}`, 'PATCH', { body, state: 'closed' });
}
console.log(`FULL CHECKS: ${failed.length} unsuccessful jobs; ${failed.length ? 'one failure issue maintained' : 'failure issue closed if present'}.`);
