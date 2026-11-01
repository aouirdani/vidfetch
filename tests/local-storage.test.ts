import {test} from 'node:test';
import assert from 'node:assert/strict';
import {opfsCapacity,STORAGE_POLICY} from '../src/local-tools/storage-policy';
test('storage admission keeps reserve and headroom; missing/invalid estimates never grant capacity',()=>{
 const MiB=1024**2;
 assert.equal(opfsCapacity({quota:116*MiB,usage:0}),80*MiB);
 assert.equal(opfsCapacity({quota:116*MiB,usage:100*MiB}),0);
 for(const e of [{},{quota:Infinity,usage:0},{quota:100,usage:-1},{quota:100},{quota:NaN,usage:0}])assert.equal(opfsCapacity(e),0);
 assert.equal(opfsCapacity({quota:100*1024**3,usage:0}),STORAGE_POLICY.fileBytes);
});
