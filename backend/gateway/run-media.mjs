import { build } from "esbuild";
import { spawn } from "node:child_process";
const output=`backend/artifacts/gateway-media-tests-${Date.now()}.cjs`;
await build({entryPoints:["backend/gateway/media.test.ts"],outfile:output,bundle:true,platform:"node",target:"node22",format:"cjs",alias:{"ffmpeg-static":"./backend/ffmpeg-static-shim.cjs"},logLevel:"warning"});
const child=spawn(process.execPath,["--test",output],{stdio:"inherit",env:{...process.env,YTDLP_PATH:process.env.YTDLP_PATH??"./.media-bin/yt-dlp",FFMPEG_PATH:process.env.FFMPEG_PATH??"/opt/homebrew/bin/ffmpeg"}});child.on("exit",code=>{process.exitCode=code??1;});
