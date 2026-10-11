// Prints filenames and rule names only, never matching secret contents.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const staged = process.argv.includes("--staged");
const argumentsList = staged ? ["ls-files", "--cached", "-z"] : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"];
const files = [...new Set(execFileSync("git", argumentsList, { encoding: "utf8" }).split("\0").filter(Boolean))];
const issues = [];
const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["secret-key", /\b(?:sb_secret_|sk_live_|sk_test_)[A-Za-z0-9_-]{20,}\b/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["database-credentials", /\b(?:postgres(?:ql)?|redis|mongodb(?:\+srv)?):\/\/[^:\s/]+:[^@\s/$]+@/],
];
for (const file of files) {
  if (/^(?:backend\/(?:artifacts|backups)\/|node_modules(?:\.local-backup)?\/|\.next\/|\.vercel\/|\.media-bin\/)|(?:\.before-|\.bak$|-backup$)|\.(?:tar|tgz|mp4|mp3|webm|mov|log|pem|key)$/.test(file)
    || (file.startsWith(".env") && file !== ".env.example")) issues.push({ file, rule: "private-or-generated-file" });
  const size = statSync(file).size;
  if (size > 1024 * 1024) issues.push({ file, rule: "file-over-1-MiB" });
  const content = readFileSync(file);
  if (content.includes(0)) continue;
  let source = content.toString("utf8");
  if (["Dockerfile", ".env.example"].includes(file)) {
    // The existing loopback-only build/example placeholder is not a secret.
    source = source.replace(/\bpostgresql:\/\/postgres:postgres@(localhost|127\.0\.0\.1)(?=[:/])/g, "example-database");
  }
  for (const [rule, pattern] of patterns) {
    if (pattern.test(source)) issues.push({ file, rule });
  }
}
console.log(JSON.stringify({ scope: staged ? "Git index" : "tracked and unignored files", files: files.length, issues }, null, 2));
if (issues.length) process.exitCode = 1;
