import {build} from 'esbuild';
import {access,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const output=resolve(process.argv[2]??`backend/artifacts/vidfetch-ovh-${Date.now()}.cjs`);
try{await access(output);throw Error('Output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(dirname(output),{recursive:true});
const result=await build({entryPoints:['backend/ovh/main.ts'],outfile:output,bundle:true,platform:'node',target:'node22',format:'cjs',alias:{'ffmpeg-static':'./backend/ffmpeg-static-shim.cjs'},metafile:true,legalComments:'none',logLevel:'warning'});
await writeFile(output+'.meta.json',JSON.stringify(result.metafile,null,2),{flag:'wx'});
console.log(output);
