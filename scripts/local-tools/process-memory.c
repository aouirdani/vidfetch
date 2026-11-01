/* macOS laboratory measurement only. Not linked to the browser tool or deployed. */
#include <libproc.h>
#include <sys/resource.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc,char **argv){
 for(int i=1;i<argc;i++){
  int pid=atoi(argv[i]);struct rusage_info_v4 usage={0};
  if(proc_pid_rusage(pid,RUSAGE_INFO_V4,(rusage_info_t *)&usage)==0)
   printf("%d %llu %llu %llu\n",pid,usage.ri_resident_size,usage.ri_phys_footprint,usage.ri_lifetime_max_phys_footprint);
 }
 return 0;
}
