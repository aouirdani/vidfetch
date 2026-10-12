import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
await mkdir("backend/artifacts",{recursive:true});
const output=`backend/artifacts/gateway-tests-${Date.now()}.cjs`;
await build({entryPoints:["backend/gateway/tests.test.ts"],outfile:output,bundle:true,platform:"node",target:"node22",format:"cjs",logLevel:"warning"});
const child=spawn(process.execPath,["--test",output],{stdio:"inherit"});child.on("exit",code=>{process.exitCode=code??1;});
