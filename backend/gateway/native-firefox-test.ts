import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** The installed Firefox, through Mozilla's driver; fixture HTTPS only. */
export async function nativeFirefox(site: string, folder: string, files: { video: Buffer; audio: Buffer }) {
  const port = 4446, endpoint = `http://127.0.0.1:${port}`;
  const driver = spawn("geckodriver", ["--host", "127.0.0.1", "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  let log = "", session: string | undefined;
  driver.stdout.on("data", chunk => log += chunk); driver.stderr.on("data", chunk => log += chunk);
  const command = async (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => {
    const res = await fetch(endpoint + path, { method, signal: AbortSignal.timeout(30000), ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const data = await res.json(); assert(res.ok, JSON.stringify(data)); return data.value;
  };
  const js = (script: string) => command(`/session/${session}/execute/sync`, { script, args: [] });
  const wait = async (check: () => Promise<boolean>) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { if (await check()) return; await delay(50); }
    assert.fail("Native Firefox condition timed out");
  };
  const click = async (selector: string) => {
    const el = await command(`/session/${session}/element`, { using: "css selector", value: selector });
    await command(`/session/${session}/element/${el['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  };
  try {
    await wait(async () => { try { return (await fetch(endpoint + "/status")).ok; } catch { return false; } });
    const value = await command("/session", { capabilities: { alwaysMatch: {
      browserName: "firefox", acceptInsecureCerts: true,
      "moz:firefoxOptions": { binary: "/Applications/Firefox.app/Contents/MacOS/firefox", args: ["-headless"], prefs: {
        "browser.download.folderList": 2, "browser.download.dir": folder, "browser.download.useDownloadDir": true,
        "browser.helperApps.neverAsk.saveToDisk": "video/mp4,audio/mpeg,application/octet-stream",
      } },
    } } }); session = value.sessionId;
    await command(`/session/${session}/url`, { url: site }); await click("#authorize");
    await wait(async () => await js("return document.querySelector('#state').textContent") === "authorized");
    const results = [];
    for (const type of ["video", "audio"] as const) {
      const ext = type === "video" ? "mp4" : "mp3", path = resolve(folder, `fixture.${ext}`);
      await js(`document.querySelector('#type').value=${JSON.stringify(type)}`);
      const start = performance.now(); await click("#download");
      await wait(async () => { try { return (await readFile(path)).equals(files[type]); } catch { return false; } });
      const savedMs = performance.now() - start;
      await wait(async () => await js("return document.querySelector('#state').textContent") === "completed");
      assert.equal(await command(`/session/${session}/url`), site + "/");
      assert.equal((await command(`/session/${session}/window/handles`)).length, 1);
      assert.equal(await js("return document.cookie"), "");
      results.push({ type, bytes: files[type].length, savedMs, noPopup: true, status: "completed" });
    }
    console.log("PASS installed Firefox: native same-tab MP4 + MP3", JSON.stringify(results));
    return { browser: value.capabilities.browserVersion, results, scope: "local HTTPS fixture; not TikTok production" };
  } catch (error) { console.error(log.slice(-4000)); throw error; }
  finally {
    if (session) await command(`/session/${session}`, undefined, "DELETE").catch(() => {});
    driver.kill("SIGTERM");
  }
}
