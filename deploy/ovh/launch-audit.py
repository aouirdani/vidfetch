#!/usr/bin/python3
"""Read-only, secret-safe inspection before any preproduction installation."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request
from datetime import datetime, timezone

def command(args):
    result = subprocess.run(args, capture_output=True, text=True)
    return {"code": result.returncode, "output": result.stdout.strip()}

def health(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=4) as response:
            return {"status": response.status, "json": json.load(response)}
    except Exception as error:
        return {"error": type(error).__name__}

def environment(path):
    if not path.exists():
        return {"present": False}
    entries = {}
    for line in path.read_text().splitlines():
        if line and not line.startswith("#") and "=" in line:
            name, value = line.split("=", 1)
            entries[name] = value.strip().strip('"').strip("'")
    stat = path.stat()
    return {"present": True, "mode": oct(stat.st_mode & 0o777), "uid": stat.st_uid,
            "names": sorted(entries), "configured": {name: bool(value) for name, value in entries.items()},
            "connectionReady": entries.get("VIDFETCH_CONNECTION_READY") == "1"}

def unit(name):
    properties = ["ActiveState", "SubState", "UnitFileState", "MainPID", "NRestarts", "FragmentPath",
                  "User", "Group", "WorkingDirectory", "EnvironmentFiles", "ControlGroup",
                  "MemoryCurrent", "MemoryPeak", "MemoryMax", "CPUUsageNSec", "CPUQuotaPerSecUSec",
                  "TasksCurrent", "TasksMax", "NoNewPrivileges", "CapabilityBoundingSet", "ExecMainStatus"]
    output = command(["systemctl", "show", name, *["-p" + item for item in properties]])
    return dict(line.split("=", 1) for line in output["output"].splitlines() if "=" in line)

assert os.geteuid() == 0, "Root is needed only to inspect protected files/rules"
report = {"timestamp": datetime.now(timezone.utc).isoformat(), "architecture": command(["uname", "-m"]),
          "os": command(["cat", "/etc/os-release"]), "memory": command(["free", "-m"]),
          "disk": command(["df", "-h", "/"]), "ports": command(["ss", "-H", "-ltnp"]),
          "cgroupControllers": Path("/sys/fs/cgroup/cgroup.controllers").read_text().strip(),
          "services": {name: unit(name) for name in ["ssh.service", "vidfetch.service", "vidfetch-gateway.service",
              "vidfetch-egress.service", "vidfetch-web-candidate.service", "vidfetch-web.service",
              "vidfetch-caddy.service", "caddy.service"]},
          "health": {str(port): health(port) for port in [3000, 8788, 8789]},
          "tools": {}, "environments": {}, "files": {}, "nftables": command(["nft", "-j", "list", "ruleset"]),
          "sshSettings": {}, "processes": command(["ps", "-u", "vidfetch-worker,vidfetch-gateway,vidfetch-web", "-o", "user,pid,ppid,comm,rss,pcpu"])}
for name, args in {"node": ["/opt/vidfetch/tools/node-v22.23.3-linux-x64/bin/node", "--version"],
                   "ytDlp": ["/usr/local/bin/yt-dlp", "--version"], "ffmpeg": ["/usr/bin/ffmpeg", "-version"],
                   "caddy": ["/opt/vidfetch/tools/caddy-2.11.7/caddy", "version"]}.items():
    output = command(args); report["tools"][name] = {"code": output["code"], "version": output["output"].splitlines()[0] if output["output"] else None}
report["caddyDNSModuleAvailable"] = "dns.providers.cloudflare" in command(["/opt/vidfetch/tools/caddy-2.11.7/caddy", "list-modules"])["output"].splitlines()
for name in ["web.env", "gateway.env", "worker.env", "proxy.env"]:
    report["environments"][name] = environment(Path("/etc/vidfetch") / name)
for name in ["/etc/vidfetch/full-migration-ready", "/etc/vidfetch/Caddyfile", "/etc/nftables.conf",
             "/etc/systemd/system/vidfetch-web-candidate.service", "/etc/vidfetch/isolation.json",
             "/usr/local/libexec/vidfetch-promote", "/usr/local/libexec/vidfetch-ci-dispatch",
             "/etc/sudoers.d/vidfetch-ci", "/var/lib/vidfetch-deploy/.ssh/authorized_keys"]:
    path = Path(name)
    if path.exists():
        info = path.stat()
        report["files"][name] = {"present": True, "bytes": info.st_size, "uid": info.st_uid,
                                "mode": oct(info.st_mode & 0o777), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    else:
        report["files"][name] = {"present": False}
current = Path("/opt/vidfetch-web/current")
report["frontendCurrent"] = str(current.resolve()) if current.exists() else None
report["frontendReleases"] = sorted(p.name for p in Path("/opt/vidfetch-web/releases").iterdir())
for line in command(["/usr/sbin/sshd", "-T"])["output"].splitlines():
    key, _, value = line.partition(" ")
    if key in ["port", "pubkeyauthentication", "passwordauthentication", "permitrootlogin"]:
        report["sshSettings"][key] = value
gateway = {}
for line in Path("/etc/vidfetch/gateway.env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        name, value = line.split("=", 1); gateway[name] = value.strip().strip('"').strip("'")
web = {}
for line in Path("/etc/vidfetch/web.env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        name, value = line.split("=", 1); web[name] = value.strip().strip('"').strip("'")
report["serviceSigningKeysMatch"] = bool(web.get("VIDFETCH_ACCESS_SIGNING_KEY")) and web.get("VIDFETCH_ACCESS_SIGNING_KEY") == gateway.get("VIDFETCH_ACCESS_SIGNING_KEY")
report["gatewayOrigins"] = {name: value for name, value in gateway.items() if name in ["VIDFETCH_GATEWAY_ORIGIN", "VIDFETCH_SITE_ORIGINS", "VIDFETCH_PRIVATE_BACKEND", "VIDFETCH_PROXY"]}
print(json.dumps(report, indent=2))
