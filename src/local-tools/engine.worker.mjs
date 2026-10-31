import {Input,BlobSource,ALL_FORMATS,Output,BufferTarget,StreamTarget,Conversion,Mp4OutputFormat,WebMOutputFormat,Mp3OutputFormat,Quality,canEncodeVideo,canEncodeAudio,CanvasSink,EncodedPacketSink} from 'mediabunny';
import {registerMp3Encoder} from '@mediabunny/mp3-encoder';
import {GIFEncoder,quantize,applyPalette} from 'gifenc';
import {LOCAL_LIMITS,PRESETS,toolLimits,outputDimensions} from './limits.ts';
let input,video,audio,duration,width,height,conversion,fileStream,limits,tool,cancelled=false,mp3Registered=false;
const send=(data,transfer=[])=>self.postMessage(data,transfer);
const fail=code=>{throw Error(code);};
const inputFrom=file=>new Input({source:new BlobSource(file,{maxCacheSize:LOCAL_LIMITS.inputCacheBytes}),formats:ALL_FORMATS});
async function probe(message){
 tool=message.tool;const device=message.device==='mobile'?'mobile':'desktop';
 if(!['audio','compress','trim','gif'].includes(tool))fail('FORMAT');
 limits=toolLimits(tool,device);const {file}=message;
 if(!(file instanceof Blob)||!file.size||file.size>limits.inputBytes)fail('SIZE');
 input?.dispose();input=inputFrom(file);
 [video,audio]=await Promise.all([input.getPrimaryVideoTrack(),input.getPrimaryAudioTrack()]);
 if(!video)fail('FORMAT');
 const [videoDuration,mediaDuration,w,h]=await Promise.all([video.computeDuration(),input.computeDuration(),video.getDisplayWidth(),video.getDisplayHeight()]);duration=tool==='audio'?mediaDuration:videoDuration;width=w;height=h;
 if(!Number.isFinite(duration)||duration<=0)fail('FORMAT');
 if(videoDuration>limits.duration||mediaDuration>limits.duration+.1||width*height>LOCAL_LIMITS.pixels||Math.max(width,height)>LOCAL_LIMITS.maxEdge||Math.min(width,height)>LOCAL_LIMITS.shortEdge)fail('BOUNDS');
 send({type:'ready',duration,width,height,audioCodec:audio?await audio.getCodec():null,videoCodec:await video.getCodec()});
}
function range(options){
 const start=tool==='trim'||tool==='gif'?Number(options.start):0,end=tool==='trim'||tool==='gif'?Number(options.end):duration;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.001||end<=start)fail('RANGE');
 return {start,end};
}
async function selectionBytes(track,start,end,keyframes){
 if(!track)return 0;
 const sink=new EncodedPacketSink(track),first=keyframes?await sink.getKeyPacket(start,{metadataOnly:true}):await sink.getPacket(start,{metadataOnly:true});
 const last=await sink.getPacket(Math.min(duration,end+2),{metadataOnly:true});
 let bytes=0;
 // Packet metadata only: this never loads every encoded packet into a buffer.
 for await(const packet of sink.packets(first??undefined,last??undefined,{metadataOnly:true})){bytes+=packet.byteLength;if(packet.timestamp>end+2)break;}
 return bytes;
}
async function plan(options){
 if(!input||!video||options.tool!==tool)fail('FORMAT');
 const {start,end}=range(options),span=end-start;
 if(tool==='gif'){
  if(span>LOCAL_LIMITS.gifSeconds||!await video.canDecode())fail('BOUNDS');
  if(![160,320,480,640].includes(Number(options.width))||![5,10,15].includes(Number(options.fps)))fail('RANGE');
  return {ext:'gif',mime:'image/gif',start,end,estimatedBytes:null,bufferBytes:limits.bufferBytes};
 }
 if(tool==='audio'){
  if(!audio)fail('AUDIO');
  if(options.audioFormat==='m4a'){
   if(await audio.getCodec()!=='aac')fail('AAC');
   const bytes=await selectionBytes(audio,0,duration,false);
   return {ext:'m4a',mime:'audio/mp4',start,end,estimatedBytes:Math.ceil(bytes*1.02)+65536,bufferBytes:limits.bufferBytes};
  }
  const bitrate=Number(options.bitrate);if(![128,192,320].includes(bitrate))fail('RANGE');
  if(!await audio.canDecode())fail('FORMAT');
  return {ext:'mp3',mime:'audio/mpeg',start,end,estimatedBytes:Math.ceil((span+.1)*bitrate*1000/8)+8192,bufferBytes:limits.bufferBytes};
 }
 if(tool==='trim'&&options.mode==='copy'){
  const codec=await video.getCodec(),mp4=['avc','hevc'].includes(codec);
  if(!mp4&&!['vp8','vp9','av1'].includes(codec))fail('FORMAT');
  const bytes=await selectionBytes(video,start,end,true)+await selectionBytes(audio,start,end,false);
  return {ext:mp4?'mp4':'webm',mime:mp4?'video/mp4':'video/webm',start,end,estimatedBytes:Math.ceil(bytes*1.03)+1024**2,bufferBytes:limits.bufferBytes};
 }
 if(!await video.canDecode()||(audio&&!await audio.canDecode()))fail('FORMAT');
 const heightLimit=Number(options.maxHeight);if(![0,360,480,720,1080].includes(heightLimit))fail('RANGE');
 const dimensions=outputDimensions(width,height,heightLimit),rate=tool==='compress'?PRESETS[options.preset]:2_000_000;
 if(!rate)fail('RANGE');
 // Prefer ordinary MP4 when both native encoders are available. A silent video does not require an audio encoder.
 const mp4=await canEncodeVideo('avc',dimensions)&&(!audio||await canEncodeAudio('aac'));
 if(!mp4&&!(await canEncodeVideo('vp8',dimensions)&&(!audio||await canEncodeAudio('opus'))))fail('FORMAT');
 return {ext:mp4?'mp4':'webm',mime:mp4?'video/mp4':'video/webm',start,end,...dimensions,rate,estimatedBytes:Math.ceil(span*(rate+(audio?128000:0))/8*1.1)+1024**2,bufferBytes:limits.bufferBytes};
}
async function run(options,handle){
 cancelled=false;const p=await plan(options);if(handle&&!handle.name.toLowerCase().endsWith('.'+p.ext))fail('SAVE');const maxOutput=handle&&tool!=='gif'?2*1024**3:limits.bufferBytes;
 if(!handle&&p.estimatedBytes>maxOutput)fail('OUTPUT');
 if(tool==='gif'){
  const sink=new CanvasSink(video,{width:Math.min(Number(options.width),width),poolSize:1}),gif=GIFEncoder(),fps=Number(options.fps),count=Math.ceil((p.end-p.start)*fps),timestamps=Array.from({length:count},(_,i)=>p.start+i/fps);
  let n=0,elapsedCentis=0;
  for await(const frame of sink.canvasesAtTimestamps(timestamps)){
   if(cancelled)fail('CANCELLED');if(!frame)fail('FORMAT');
   const canvas=frame.canvas,rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data,palette=quantize(rgba,256),indexed=applyPalette(rgba,palette);
   const centis=Math.max(1,Math.round(Math.min(p.end-p.start,(n+1)/fps)*100)-elapsedCentis);elapsedCentis+=centis;
   gif.writeFrame(indexed,canvas.width,canvas.height,{palette,delay:centis*10,repeat:0});if(gif.bytesView().byteLength>maxOutput)fail('OUTPUT');send({type:'progress',value:++n/count});
  }
  gif.finish();const bytes=gif.bytes().slice();if(bytes.byteLength>maxOutput)fail('OUTPUT');
  send({type:'result',bytes,mime:p.mime,ext:p.ext,duration:elapsedCentis/100,size:bytes.byteLength},[bytes.buffer]);return;
 }
 let target,size=0;
 if(handle){
  fileStream=await handle.createWritable().catch(()=>fail('SAVE'));
  target=new StreamTarget(new WritableStream({async write(chunk){if(cancelled)fail('CANCELLED');const end=chunk.position+chunk.data.byteLength;if(end>maxOutput)fail('OUTPUT');size=Math.max(size,end);await fileStream.write(chunk).catch(()=>fail('SAVE'));},async close(){if(cancelled)fail('CANCELLED');await fileStream.close().catch(()=>fail('SAVE'));},async abort(reason){await fileStream.abort(reason);}}),{chunked:true,chunkSize:LOCAL_LIMITS.streamChunkBytes});
 }else{
  // Refuse before the target can grow. The event after a write would be too late.
  class BoundedBuffer extends BufferTarget{_write(data,position){if(position+data.byteLength>maxOutput)fail('OUTPUT');super._write(data,position);}}
  target=new BoundedBuffer();
 }
 let format,copy={},videoOptions,audioOptions;
 const discardVideo=track=>track.number!==video.number,discardAudio=track=>!audio||track.number!==audio.number;
 // Standard MP4 with metadata at the end: no accumulated 'in-memory' fast-start packets or fMP4 compatibility loss.
 const mp4=()=>new Mp4OutputFormat({fastStart:false});
 if(tool==='audio'){
  videoOptions={discard:true};
  if(p.ext==='m4a'){format=mp4();copy={mode:'forced'};audioOptions=track=>({discard:discardAudio(track)});}
  else{if(!mp3Registered){registerMp3Encoder();mp3Registered=true;}format=new Mp3OutputFormat();audioOptions=track=>({discard:discardAudio(track),codec:'mp3',bitrate:Number(options.bitrate)*1000,forceTranscode:true});}
 }else if(tool==='trim'&&options.mode==='copy'){
  format=p.ext==='mp4'?mp4():new WebMOutputFormat();copy={mode:'forced',shiftTolerance:Infinity,boundaryPolicy:'expand'};videoOptions=track=>({discard:discardVideo(track)});audioOptions=track=>({discard:discardAudio(track)});
 }else{
  format=p.ext==='mp4'?mp4():new WebMOutputFormat();copy=false;
  videoOptions=track=>({discard:discardVideo(track),width:p.width,height:p.height,fit:'fill',codec:p.ext==='mp4'?'avc':'vp8',quality:new Quality({bitrate:p.rate}),forceTranscode:true});
  audioOptions=track=>({discard:discardAudio(track),codec:p.ext==='mp4'?'aac':'opus',bitrate:128000,forceTranscode:true});
 }
 const output=new Output({target,format});
 conversion=await Conversion.init({input,output,video:videoOptions,audio:audioOptions,trim:{start:p.start,end:p.end},copy});
 if(!conversion.isValid||conversion.discardedTracks.some(t=>t.track===video&&tool!=='audio')||(audio&&conversion.discardedTracks.some(t=>t.track===audio)))fail('FORMAT');
 conversion.onProgress=value=>send({type:'progress',value});await conversion.execute();
 let resultInput,bytes;
 if(handle){const file=await handle.getFile().catch(()=>fail('SAVE'));size=file.size;resultInput=inputFrom(file);}
 else{bytes=new Uint8Array(target.buffer);size=bytes.byteLength;resultInput=inputFrom(new Blob([bytes]));}
 const actual=await resultInput.computeDuration();resultInput.dispose();fileStream=undefined;conversion=undefined;
 if(handle)send({type:'result',saved:true,name:handle.name,size,mime:p.mime,ext:p.ext,duration:actual});
 else send({type:'result',bytes,size,mime:p.mime,ext:p.ext,duration:actual},[bytes.buffer]);
}
self.onmessage=async({data:msg})=>{
 try{
  if(msg.type==='probe')await probe(msg);
  else if(msg.type==='plan'){const p=await plan(msg.options);send({type:'plan',id:msg.id,...p});}
  else if(msg.type==='run')await run(msg.options,msg.fileHandle);
  else if(msg.type==='cancel'){cancelled=true;await conversion?.cancel();await fileStream?.abort().catch(()=>{});input?.dispose();send({type:'cancelled'});self.close();}
 }catch(error){await fileStream?.abort().catch(()=>{});fileStream=undefined;await conversion?.cancel().catch(()=>{});conversion=undefined;send({type:msg.type==='plan'?'plan-error':'error',id:msg.id,phase:msg.type,code:['SIZE','FORMAT','BOUNDS','RANGE','AUDIO','AAC','OUTPUT','CANCELLED','SAVE'].includes(error.message)?error.message:'FORMAT'});}
};
