import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type ProcessResult = { code: number | null; signal: NodeJS.Signals | null; stderr: string; error?: Error };

/** A private POSIX group also owns ffmpeg/JS runtime descendants started by yt-dlp. */
export function startEngineProcess(binary: string, args: string[], options: {
  signal?: AbortSignal;
  onFailure?: (result: ProcessResult) => void;
} = {}) {
  options.signal?.throwIfAborted();
  const child: ChildProcessWithoutNullStreams = spawn(binary, args, {
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32",
  });
  let stderr = "", closed = false, reported = false;
  const stop = () => {
    if (closed) return;
    if (child.pid) {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* Already reaped, or no longer present. */ }
    }
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  };
  const failure = (result: ProcessResult) => {
    if (reported) return;
    reported = true;
    options.onFailure?.(result);
  };
  child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-12000); });
  // Pipe failures are reported and never become unhandled EventEmitter errors.
  child.stdin.on("error", (error: Error) => failure({ code: null, signal: null, stderr, error }));
  child.stdout.on("error", (error: Error) => failure({ code: null, signal: null, stderr, error }));
  child.stderr.on("error", () => {});
  const completion = new Promise<ProcessResult>((resolve) => {
    child.once("error", (error: Error) => failure({ code: null, signal: null, stderr, error }));
    child.once("exit", (code, signal) => {
      if (code !== 0) failure({ code, signal, stderr });
    });
    child.once("close", (code, signal) => {
      closed = true;
      options.signal?.removeEventListener("abort", stop);
      resolve({ code, signal, stderr });
    });
  });
  options.signal?.addEventListener("abort", stop, { once: true });
  if (options.signal?.aborted) stop();
  return { child, completion, stop };
}
