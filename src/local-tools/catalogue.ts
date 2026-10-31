import content from '../../content/local-tools.json';
import {LANGUAGES,type Locale} from '../i18n/config';
import type {LocalToolId} from './limits';
export type ToolCopy={title:string;description:string;heading:string;intro:string;sections:{heading:string;paragraphs:string[]}[];faqs:{question:string;answer:string}[]};
export const TOOL_IDS:LocalToolId[]=['audio','compress','trim','gif'];
export const SLUGS:Record<Locale,string[]>={
 en:['video-to-mp3','compress-video','trim-video','video-to-gif'],fr:['convertir-video-en-mp3','compresser-video','couper-video','video-en-gif'],es:['convertir-video-a-mp3','comprimir-video','cortar-video','video-a-gif'],'pt-BR':['converter-video-para-mp3','comprimir-video','cortar-video','video-para-gif'],id:['konversi-video-ke-mp3','kompres-video','potong-video','video-ke-gif'],de:['video-in-mp3-umwandeln','video-komprimieren','video-schneiden','video-in-gif'],it:['convertire-video-in-mp3','comprimere-video','tagliare-video','video-in-gif'],ar:['tahwil-video-ila-mp3','daght-video','qass-video','video-ila-gif']};
export const TOOLS_LABEL:Record<Locale,string>={en:'Local tools',fr:'Outils locaux',es:'Herramientas locales','pt-BR':'Ferramentas locais',id:'Alat lokal',de:'Lokale Werkzeuge',it:'Strumenti locali',ar:'أدوات محلية'};
export const LICENSE_LABEL:Record<Locale,string>={en:'Software licenses',fr:'Licences logicielles',es:'Licencias de software','pt-BR':'Licenças de software',id:'Lisensi perangkat lunak',de:'Softwarelizenzen',it:'Licenze software',ar:'تراخيص البرامج'};
export const TOOL_UPDATED='2026-10-30';
export function toolCopy(locale:Locale,id:LocalToolId):ToolCopy{return content[locale][id];}
export function toolPath(locale:Locale,id:LocalToolId){return `${locale==='en'?'':`/${LANGUAGES[locale].prefix}`}/${SLUGS[locale][TOOL_IDS.indexOf(id)]}`;}
export function toolLinks(locale:Locale){return TOOL_IDS.map(id=>({id,href:toolPath(locale,id),label:toolCopy(locale,id).heading}));}
export const TOOL_GUIDES:Record<LocalToolId,string[]>={audio:['video-to-audio','mp3-vs-m4a'],compress:['reduce-video-size','720p-1080p-4k','bitrate-vs-resolution'],trim:['backup-your-videos','video-format-smartphone'],gif:['mp4-vs-webm','bitrate-vs-resolution']};
