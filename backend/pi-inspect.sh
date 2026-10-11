#!/bin/sh
# Read-only. This script never changes services, files or network settings.
set -eu
id
uname -srm
cat /etc/os-release
node --version
/usr/local/bin/yt-dlp --version
/usr/bin/ffmpeg -version | head -n 1
free -m
df -h /home/user
ss -ltnp '( sport = :8787 or sport = :8788 )'
# Only executable names, not command arguments that might contain credentials.
ps -eo pid,ppid,comm,rss,pcpu
for path in /home/user/vidfetch-backend /home/user/vidfetch-backend-build; do
  if [ -e "$path" ]; then ls -ld "$path"; fi
done
