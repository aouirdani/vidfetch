import { build } from "esbuild";
import { spawn } from "node:child_process";
const output=`backend/artifacts/gateway-browser-${Date.now()}.cjs`;
await build({entryPoints:["backend/gateway/browser.test.ts"],outfile:output,bundle:true,platform:"node",target:"node22",format:"cjs",external:["esbuild","playwright"],logLevel:"warning"});
const child=spawn(process.execPath,["--test",output],{stdio:"inherit"});child.on("exit",code=>{process.exitCode=code??1;});
