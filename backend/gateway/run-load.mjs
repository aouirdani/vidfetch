import {build} from 'esbuild';
import {spawn} from 'node:child_process';
const output=`backend/artifacts/gateway-load-${Date.now()}.cjs`;
await build({stdin:{contents:"import './load.test'; import './queue-expiry.test';",resolveDir:'backend/gateway',sourcefile:'load-suite.ts'},outfile:output,bundle:true,platform:'node',target:'node22',format:'cjs',logLevel:'warning'});
const child=spawn(process.execPath,['--test',output],{stdio:'inherit'});child.once('exit',code=>{process.exitCode=code??1;});
