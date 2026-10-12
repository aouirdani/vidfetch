import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

test("editorial commands require review and actual-publication confirmation; changes get backups", () => {
  const directory = mkdtempSync(join(tmpdir(), "vidfetch-editorial-"));
  const id = "test-guide", body = "Original body.";
  const today = new Date().toISOString().slice(0, 10);
  const file = join(directory, "content/guides/fr", id + ".md");
  const write = (path: string, meta: object, body: string) => writeFileSync(path, "---\n" + JSON.stringify(meta) + "\n---\n" + body);
  const run = (script: string, args: string[]) => spawnSync(process.execPath, [resolve(script), ...args], { cwd: directory, encoding: "utf8" });
  try {
    mkdirSync(join(directory, "content/guides/fr"), { recursive: true });
    mkdirSync(join(directory, "src/i18n/messages"), { recursive: true });
    writeFileSync(join(directory, "src/i18n/messages/fr.json"), "{}"); writeFileSync(join(directory, "src/i18n/messages/en.json"), "{}");
    write(join(directory, "content/guides", id + ".md"), { status: "ready", created: today, published: null }, body);
    write(file, { status: "review", created: today, published: null, sourceBodySha256: createHash("sha256").update(body).digest("hex") }, "Texte ".repeat(260));
    const initial = readFileSync(file, "utf8");
    assert.notEqual(run("scripts/i18n/review-guide.mjs", []).status, 0);
    assert.notEqual(run("scripts/ovh/publish-guides.mjs", []).status, 0);
    assert.notEqual(run("scripts/ovh/publish-guides.mjs", ["--confirmed-publication", "--locale=fr", `--id=${id}`]).status, 0);
    assert.equal(readFileSync(file, "utf8"), initial);
    assert.equal(run("scripts/i18n/review-guide.mjs", ["--locale=fr", `--id=${id}`, "--reviewer=fixture-reviewer", "--confirm-linguistic-review", "--confirm-technical-review"]).status, 0);
    let metadata = JSON.parse(readFileSync(file, "utf8").split("---\n")[1]);
    assert.equal(metadata.status, "ready"); assert.equal(metadata.published, null);
    assert.equal(run("scripts/ovh/publish-guides.mjs", ["--confirmed-publication", "--locale=fr", `--id=${id}`]).status, 0);
    metadata = JSON.parse(readFileSync(file, "utf8").split("---\n")[1]); assert.equal(metadata.published, today);
    assert.equal(readdirSync(join(directory, "backend/backups")).length, 2);
    write(join(directory, "content/guides", id + ".md"), { status: "ready", created: today }, body + " Changed.");
    assert.notEqual(run("scripts/ovh/publish-guides.mjs", ["--confirmed-publication", "--locale=fr", `--id=${id}`]).status, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
