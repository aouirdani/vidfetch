// Validate saved evidence after the real Pi retention runner has finished.
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const directory=resolve(process.argv[2] || 'backend/artifacts/preproduction-20261011-UfO9y4');
const json=async name=>JSON.parse(await readFile(resolve(directory,name),'utf8'));
const [main,resources,http,backup,macBackup,systemd]=await Promise.all([
  json('pi-results.json'),json('pi-resources.json'),json('pi-http-extra.json'),json('backup-verification.json'),
  json('backup-mac-verification.json'),readFile(resolve(directory,'systemd-reviewed.log'),'utf8'),
]);
const checks={};
checks.backupMatched=backup.sha256===macBackup.sha256 && backup.bytes===macBackup.bytes && backup.verifiedFiles===21648;
checks.correctedBundle=createHash('sha256').update(await readFile('backend/artifacts/vidfetch-backend-pi-20261011.cjs')).digest('hex')==='d370ccfb8574a2f714e86fcde6e555ddd665a846be761ffe29256a648d4a168c';
checks.health=main.tests.health.http===200 && main.tests.health.body.ok===true;
for(const kind of ['video','audio']){
  const item=main.tests[kind];
  checks[kind+'Streaming']=item.http===200 && item.bytes>0 && item.status.bytes===item.bytes && item.status.status==='completed' && item.status.error===null && Number(item.probe.format.size)===item.bytes;
  checks[kind+'Integrity']=item.fullDecode.exit===0 && item.fullDecode.stderr==='';
  checks[kind+'SingleUse']=item.ticketReuse===404;
  const observed=main.retention.filter(item=>item.kind===kind);
  checks[kind+'Retention']=observed.some(item=>item.stage==='before' && item.elapsedMs<1800000 && item.http===200 && item.status==='completed') && observed.some(item=>item.stage==='after' && item.elapsedMs>=1800000 && item.http===404 && item.code==='EXPIRED');
}
checks.mp3Codec=main.tests.audio.contentType==='audio/mpeg' && main.tests.audio.probe.streams.length===1 && main.tests.audio.probe.streams[0].codec_name==='mp3';
checks.concurrency=main.tests.concurrency===429;
checks.http=Object.values(http.tests).every(item=>item.ok===true);
checks.cleanup=main.backendExit===0 && resources.runnerExit.code===0 && resources.remainingOwned.length===0 && resources.port8788After.length===0;
checks.loopback=/127\.0\.0\.1:8788/.test(main.portsRunning);
checks.systemdPrepared=systemd.includes('SYSTEMD_VERIFY_EXIT=0') && systemd.includes('Memory cgroup controller unavailable') && systemd.includes('PREFLIGHT_EXIT=1');
const finalInspection=await readFile(resolve(directory,'final-inspection.log'),'utf8');
checks.existingServerPreserved=finalInspection.includes('3600f54180e7c6ecf41950597dfb6e4bb90d9be6db35a4b3b685b2af09dc1f09');
let removal=null;
try{await access(resolve(directory,'removal-results.json'));removal=await json('removal-results.json');}catch{}
const output={verified:new Date().toISOString(),checks,resources:resources.summary,
  phase1:{backup:'VALIDÉ',removal:removal?'À VÉRIFIER DANS removal-results.json':'BLOQUÉ — confirmation de suppression/sudo non reçue',performed:Boolean(removal)},
  phase2:Object.values(checks).every(Boolean)?'VALIDÉ':'ÉCHEC',
  phase3:'PRÉPARÉ — parsing VALIDÉ ; activation BLOQUÉE par contrôleur mémoire absent et accord requis',
  phase4:'ARCHITECTURE PRÉPARÉE — passerelle et isolation réseau NON IMPLÉMENTÉES / NON TESTÉES',
  protectedServices:{before:resources.servicesBefore,after:resources.servicesAfter},
  limitations:['8787 inactif avant et après : fonctionnement actif non testé.',
    'RSS/CPU échantillonnés chaque seconde ; somme RSS inclut des pages partagées.',
    'La sauvegarde était encore en vérification pendant le début du test vidéo ; coût système supplémentaire hors famille VidFetch.',
    'Aucun test de boot/restart du service, aucun tunnel ou changement Vercel/Supabase.']};
await writeFile(resolve(directory,'verification.json'),JSON.stringify(output,null,2),{flag:'wx'});
console.log(JSON.stringify(output,null,2));
if(!Object.values(checks).every(Boolean))process.exitCode=1;
