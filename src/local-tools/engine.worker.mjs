import { Input, BlobSource, ALL_FORMATS, Output, BufferTarget, Conversion, Mp4OutputFormat, WebMOutputFormat, Mp3OutputFormat, Quality, canEncodeVideo, canEncodeAudio, CanvasSink } from 'mediabunny';
import { registerMp3Encoder } from '@mediabunny/mp3-encoder';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { LOCAL_LIMITS, PRESETS } from './limits.ts';
let input, video, audio, duration, width, height, conversion, cancelled = false, maxOutput;
const send = (data, transfer=[]) => self.postMessage(data,transfer);
const fail = code => { throw new Error(code); };
const inputFrom = file => new Input({source:new BlobSource(file),formats:ALL_FORMATS});
async function probe(file, limit) {
  if (!(file instanceof Blob) || file.size > limit || !file.size) fail('SIZE');
  input?.dispose(); input=inputFrom(file);
  [video,audio,duration]=await Promise.all([input.getPrimaryVideoTrack(),input.getPrimaryAudioTrack(),input.computeDuration()]);
  if(!video || !Number.isFinite(duration) || duration<=0) fail('FORMAT');
  [width,height]=await Promise.all([video.getDisplayWidth(),video.getDisplayHeight()]);
  if(duration>LOCAL_LIMITS.duration || width*height>LOCAL_LIMITS.pixels) fail('BOUNDS');
  maxOutput=limit*2;
  send({type:'ready',duration,width,height,audioCodec:audio ? await audio.getCodec() : null,videoCodec:await video.getCodec()});
}
async function run(options) {
  cancelled=false;
  const {tool}=options;
  if(!input || !video) fail('FORMAT');
  let start=tool==='trim'||tool==='gif'?Number(options.start):0,end=tool==='trim'||tool==='gif'?Number(options.end):duration;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.001||end<=start) fail('RANGE');
  if(tool==='gif') {
    if(end-start>LOCAL_LIMITS.gifSeconds || !await video.canDecode()) fail('BOUNDS');
    const w=Number(options.width),fps=Number(options.fps);
    if(![160,320,480,640].includes(w)||![5,10,15].includes(fps)) fail('RANGE');
    const sink=new CanvasSink(video,{width:Math.min(w,width),poolSize:1}),gif=GIFEncoder();
    const count=Math.ceil((end-start)*fps),timestamps=Array.from({length:count},(_,i)=>start+i/fps);
    let n=0,elapsedCentis=0;
    for await (const frame of sink.canvasesAtTimestamps(timestamps)) {
      if(cancelled) fail('CANCELLED');
      if(!frame) fail('FORMAT');
      const canvas=frame.canvas,ctx=canvas.getContext('2d',{willReadFrequently:true}),rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const palette=quantize(rgba,256),indexed=applyPalette(rgba,palette);
      const centis=Math.max(1,Math.round(Math.min(end-start,(n+1)/fps)*100)-elapsedCentis);elapsedCentis+=centis;
      gif.writeFrame(indexed,canvas.width,canvas.height,{palette,delay:centis*10,repeat:0});
      if(gif.bytesView().byteLength>maxOutput) fail('OUTPUT');
      send({type:'progress',value:++n/count});
    }
    gif.finish(); const bytes=gif.bytes().slice();if(bytes.byteLength>maxOutput)fail('OUTPUT');
    send({type:'result',bytes,mime:'image/gif',ext:'gif',duration:elapsedCentis/100},[bytes.buffer]);return;
  }
  const target=new BufferTarget();let format,ext,mime,copy={},videoOptions,audioOptions;
  const discardOtherVideo=track=>track.number!==video.number;
  const discardOtherAudio=track=>!audio||track.number!==audio.number;
  if(tool==='audio') {
    if(!audio) fail('AUDIO');
    if(options.audioFormat==='m4a') {
      if(await audio.getCodec()!=='aac') fail('AAC');
      format=new Mp4OutputFormat();ext='m4a';mime='audio/mp4';copy={mode:'forced'};audioOptions=track=>({discard:discardOtherAudio(track)});
    } else {
      const rate=Number(options.bitrate);if(![128,192,320].includes(rate))fail('RANGE');
      if(!await audio.canDecode())fail('FORMAT');
      registerMp3Encoder();format=new Mp3OutputFormat();ext='mp3';mime='audio/mpeg';
      audioOptions=track=>({discard:discardOtherAudio(track),codec:'mp3',bitrate:rate*1000,forceTranscode:true});
    }
    videoOptions={discard:true};
  } else if(tool==='trim' && options.mode==='copy') {
    const vc=await video.getCodec();
    if(['avc','hevc'].includes(vc)){format=new Mp4OutputFormat();ext='mp4';mime='video/mp4';}
    else if(['vp8','vp9','av1'].includes(vc)){format=new WebMOutputFormat();ext='webm';mime='video/webm';}else fail('FORMAT');
    copy={mode:'forced',shiftTolerance:Infinity,boundaryPolicy:'expand'};
    videoOptions=track=>({discard:discardOtherVideo(track)});audioOptions=track=>({discard:discardOtherAudio(track)});
  } else {
    if(!await video.canDecode() || (audio&&!await audio.canDecode()))fail('FORMAT');
    const maxHeight=Number(options.maxHeight)||height;
    if(![0,360,480,720,1080].includes(Number(options.maxHeight)))fail('RANGE');
    let h=Math.min(height,maxHeight),w=width*h/height;w=Math.max(2,Math.floor(w/2)*2);h=Math.max(2,Math.floor(h/2)*2);
    const rate=tool==='compress'?PRESETS[options.preset]:2_000_000;if(!rate)fail('RANGE');
    // Prefer portable software WebM encoders; use MP4 only when the browser can encode both required tracks.
    if(await canEncodeVideo('vp8',{width:w,height:h})&&(!audio||await canEncodeAudio('opus'))) {format=new WebMOutputFormat();ext='webm';mime='video/webm';}
    else if(await canEncodeVideo('avc',{width:w,height:h})&&(!audio||await canEncodeAudio('aac'))) {format=new Mp4OutputFormat();ext='mp4';mime='video/mp4';}else fail('FORMAT');
    copy=false;
    videoOptions=track=>({discard:discardOtherVideo(track),width:w,height:h,fit:'fill',codec:ext==='webm'?'vp8':'avc',quality:new Quality({bitrate:rate}),forceTranscode:true});
    audioOptions=track=>({discard:discardOtherAudio(track),codec:ext==='webm'?'opus':'aac',bitrate:128000,forceTranscode:true});
  }
  const output=new Output({target,format});
  target.on('write',({end})=>{if(end>maxOutput){void conversion?.cancel();fail('OUTPUT');}});
  conversion=await Conversion.init({input,output,video:videoOptions,audio:audioOptions,trim:{start,end},copy});
  if(!conversion.isValid || conversion.discardedTracks.some(t=>t.track===video&&tool!=='audio') || (audio&&conversion.discardedTracks.some(t=>t.track===audio)))fail('FORMAT');
  conversion.onProgress=value=>send({type:'progress',value});await conversion.execute();
  const bytes=new Uint8Array(target.buffer);if(bytes.byteLength>maxOutput)fail('OUTPUT');
  const resultInput=inputFrom(new Blob([bytes]));const actual=await resultInput.computeDuration();resultInput.dispose();
  self.postMessage({type:'result',bytes,mime,ext,duration:actual},[bytes.buffer]);
}
self.onmessage=async event=>{
  const msg=event.data;
  try {
    if(msg.type==='probe')await probe(msg.file,msg.limit);
    else if(msg.type==='run')await run(msg.options);
    else if(msg.type==='cancel'){cancelled=true;await conversion?.cancel();input?.dispose();self.close();}
  } catch(error){send({type:'error',code:['SIZE','FORMAT','BOUNDS','RANGE','AUDIO','AAC','OUTPUT','CANCELLED'].includes(error.message)?error.message:'FORMAT'});}
};
