// Scenarios are estimates. No benchmark or production capacity claim is implied.
import {writeFile} from 'node:fs/promises';
const scenarios=[];
for(const visitors of [100,500,1000,3000])for(const conversion of [0.2,1]){
 const downloads=visitors*conversion,averageMiB=10,metadataSeconds=20,prepareSeconds=20,availableHours=12,utilizationCeiling=0.6;
 const hourlyAverage=downloads/availableHours;
 const networkMbps=downloads*averageMiB*1024**2*8/(availableHours*3600)/1e6;
 const transferSeconds=averageMiB*1024**2/(64*1024);
 const busySeconds=visitors*metadataSeconds+downloads*(prepareSeconds+transferSeconds);
 scenarios.push({visitors,conversion,downloads,assumptions:{averageMiB,metadataSeconds,prepareSeconds,availableHours,streamKiBps:64,utilizationCeiling},
  averageDownloadsPerHour:hourlyAverage,mediaGiBPerDay:downloads*averageMiB/1024,averageUplinkMbpsDuring12Hours:networkMbps,
  workerHours:busySeconds/3600,workerUtilization:busySeconds/(availableHours*3600),
  withinAssumedUtilization:busySeconds/(availableHours*3600)<=utilizationCeiling,
  withinInitialAttemptQuota:downloads<=100,withinInitialByteQuota:downloads*averageMiB<=4096,
  transferOnlyMaxPerHour:3600/transferSeconds,fullServiceMaxPerHourIgnoringInfo:3600/(transferSeconds+prepareSeconds),
  productionCapacityValidated:false});
}
const report={kind:'estimated scenarios only',measuredIspUplinkMbps:null,measuredFunnelMbps:null,scenarios};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});else console.log(JSON.stringify(report,null,2));
