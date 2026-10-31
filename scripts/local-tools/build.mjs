import {build} from 'esbuild';
import {mkdir,cp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
const source=Buffer.concat(await Promise.all([1,2].map(i=>readFile(`scripts/local-tools/lame/source-3.100.part-${i}`))));
if(createHash('sha256').update(source).digest('hex')!=='ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e')throw Error('LAME source checksum mismatch');
const out='public/local-media/generated';await mkdir(`${out}/licenses`,{recursive:true});
// Replace upstream's inlined binary worker with our reproducible, separately relinkable LAME build.
const plugin={name:'self-hosted-lame',setup(b){b.onLoad({filter:/mediabunny-mp3-encoder\.mjs$/},async args=>{
 const original=await readFile(args.path,'utf8');const contents=original.replace(/function Worker2\(\) \{[\s\S]*?\n\}/,()=>`function Worker2(){return new Worker('/local-media/generated/mp3.js',{type:'module'});}`);
 if(contents===original)throw Error('Upstream worker changed: review integration');return {contents,resolveDir:resolve('node_modules/@mediabunny/mp3-encoder/dist/bundles')};
});}};
await build({entryPoints:['src/local-tools/engine.worker.mjs'],outfile:`${out}/engine.js`,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',plugins:[plugin]});
await build({entryPoints:['node_modules/@mediabunny/mp3-encoder/src/encode.worker.ts'],outfile:`${out}/mp3.js`,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',plugins:[{name:'lame-binary',setup(b){b.onResolve({filter:/\.\.\/build\/lame$/},()=>({path:resolve('public/local-media/runtime/lame.js')}));}}]});
await cp('public/local-media/runtime/lame.wasm',`${out}/lame.wasm`);
const packages=[['mediabunny','mediabunny','MPL-2.0'],['@mediabunny/mp3-encoder','mp3-encoder','MPL-2.0'],['gifenc','gifenc','MIT']];
const manifest=[];
for(const [name,id,license] of packages){
 const root=`node_modules/${name}`,pkg=JSON.parse(await readFile(`${root}/package.json`,'utf8'));
 await cp(`${root}/${id==='gifenc'?'LICENSE.md':'LICENSE'}`,`${out}/licenses/${id}.txt`);
 manifest.push({name,version:pkg.version,license});
}
await cp('node_modules/@mediabunny/mp3-encoder/licenses/lame/COPYING',`${out}/licenses/lame.txt`);
for(const name of ['emscripten','musl','compiler-rt'])await cp(`scripts/local-tools/lame/notices/${name}.txt`,`${out}/licenses/${name}.txt`);
// Corresponding MPL source, bridge, rebuild recipe and unmodified LGPL source on the same host.
const kit=`${out}/sources`;await mkdir(kit,{recursive:true});
for(const [name,id]of packages){
 await mkdir(`${kit}/${id}`,{recursive:true});
 for(const file of ['src','package.json',id==='gifenc'?'LICENSE.md':'LICENSE'])await cp(`node_modules/${name}/${file}`,`${kit}/${id}/${file}`,{recursive:true});
}
await mkdir(`${kit}/integration`,{recursive:true});
for(const file of ['scripts/local-tools/build.mjs','src/local-tools/engine.worker.mjs','src/local-tools/limits.ts','package.json','package-lock.json']){await mkdir(`${kit}/integration/${dirname(file)}`,{recursive:true});await cp(file,`${kit}/integration/${file}`);}
// The extension uses MP3 helpers from the same upstream monorepo; their unminified form is in the pinned bundle.
const bundle=await readFile('node_modules/@mediabunny/mp3-encoder/dist/bundles/mediabunny-mp3-encoder.mjs','utf8');
await writeFile(`${kit}/mp3-encoder/integration.mjs`,bundle.replace(/function Worker2\(\) \{[\s\S]*?\n\}/,()=>`function Worker2(){return new Worker('/local-media/generated/mp3.js',{type:'module'});}`));
await cp('scripts/local-tools/lame',`${kit}/rebuild`,{recursive:true});
await writeFile(`${kit}/lame-3.100.tar.gz`,source);
execFileSync('tar',['-czf',`${out}/corresponding-source.tar.gz`,'-C',kit,'.']);
await rm(kit,{recursive:true,force:true});
const files=['engine.js','mp3.js','lame.wasm','corresponding-source.tar.gz'];
for(const file of files){const bytes=await readFile(`${out}/${file}`);manifest.push({file,bytes:(await stat(`${out}/${file}`)).size,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
