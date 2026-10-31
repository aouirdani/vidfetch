/** Synthetic encoded H.264/AAC, no free-box padding. Repeated 10 s patterns, not camera/HEVC samples. */
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const args=process.argv.slice(2),extended=args.includes('--extended');
const output=args.includes('--out')?args[args.indexOf('--out')+1]:`${tmpdir()}/vidfetch-camera-bench`;
const root=resolve(output);await mkdir(root,{recursive:true});const manifest=[];
function run(args){const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{stdio:'inherit'});if(p.status!==0)throw Error('fixture ffmpeg failed');}
function probe(path){const p=spawnSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',path],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);return JSON.parse(p.stdout);}
for(const [id,size]of [['1080p','1920x1080'],['4k','3840x2160']]){
 const seed=`${root}/${id}-seed.mp4`;
 const bitrate=extended?'5300k':'13500k';
 run(['-f','lavfi','-i',`testsrc2=size=${size}:rate=30`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','10','-c:v','libx264','-preset','ultrafast','-threads','4','-b:v',bitrate,'-maxrate',extended?'6500k':'18000k','-bufsize',extended?'10600k':'27000k','-g','60','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-y',seed]);
 const info=probe(seed),rate=Number(info.format.size)/Number(info.format.duration);
 const cases=extended?[['5min',299],['20min',1190]]:[50,200,500].map(mib=>[String(mib),Math.round(mib*1024**2/rate*30)/30]);
 for(const [label,duration]of cases){const path=`${root}/${id}-${label}.mp4`;let input=seed;if(extended&&label==='20min'){input=`${root}/${id}-desktop-seed.mp4`;run(['-i',seed,'-c:v','libx264','-preset','ultrafast','-threads','4','-b:v','7000k','-maxrate','9000k','-bufsize','14000k','-g','60','-c:a','copy','-y',input]);}run(['-stream_loop','-1','-i',input,'-t',String(duration),'-c','copy','-movflags','+faststart','-y',path]);const media=probe(path);manifest.push({id:`${id}-${label}`,path,targetMiB:extended?null:Number(label),bytes:(await stat(path)).size,duration:Number(media.format.duration),width:media.streams[0].width,height:media.streams[0].height,video:media.streams[0].codec_name,audio:media.streams[1].codec_name});console.log(JSON.stringify(manifest.at(-1)));}
}
await writeFile(`${root}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
