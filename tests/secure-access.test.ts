import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SecureDownloadClient } from "../src/lib/secure-client";
import { publicGatewayOrigin } from "../src/lib/gateway-origin";
import { createAccessIssuer } from "../src/server/download-access";
import { AccessError, browserKey, serviceKey, signAccess, verifyAccess, verifyProof } from "../src/server/access-crypto";
import { publicJsonPost } from "../src/server/public-request";
import { GatewayLedger } from "../backend/gateway/ledger";
import configuration from "../next.config";

const site="https://app.example.net", origin="https://download.example.net";
describe("secure visitor authorization",()=>{
  it("rejects local/insecure/credential/path origins, including numeric IP spellings",()=>{
    for(const url of ["http://download.example.net","https://127.0.0.1","https://2130706433","https://[::1]","https://192.168.1.112","https://x.local","https://x.home.arpa","https://u:p@download.example.net","https://download.example.net:444","https://download.example.net/path","https://download.example.net?x=y"])assert.equal(publicGatewayOrigin(url),null,url);
    assert.equal(publicGatewayOrigin(origin),origin);
  });
  it("keeps the secure integration disabled without a reviewed readiness flag",()=>{
    const keys=["VIDFETCH_TARGET","VIDFETCH_CONNECTION_READY","NEXT_PUBLIC_API_ORIGIN","NEXT_PUBLIC_TURNSTILE_SITE_KEY","NEXT_PUBLIC_SITE_URL"];
    const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
    try{
      process.env.VIDFETCH_TARGET="secure-gateway";process.env.NEXT_PUBLIC_SITE_URL=site;process.env.NEXT_PUBLIC_API_ORIGIN=origin;process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY="fixture-public-site-key";delete process.env.VIDFETCH_CONNECTION_READY;
      assert.equal(configuration("phase-production-server").env?.NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE,"1");
      process.env.VIDFETCH_CONNECTION_READY="1";
      assert.equal(configuration("phase-production-server").env?.NEXT_PUBLIC_SECURE_GATEWAY,"1");
      process.env.NEXT_PUBLIC_API_ORIGIN="https://192.168.1.112";
      const config=configuration("phase-production-server");assert.equal(config.env?.NEXT_PUBLIC_DOWNLOADS_UNAVAILABLE,"1");assert.equal(config.env?.NEXT_PUBLIC_API_ORIGIN,"");
    }finally{for(const k of keys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
  });
  it("issues grants only after a challenge, preserves owner on renewal, enforces PoP",async()=>{
    const key=randomBytes(32);let cookie="", verified=0;
    const issuer=createAccessIssuer({key,siteOrigin:site,gatewayOrigin:origin,verifyChallenge:async(token,host)=>{verified++;return token==="original-fixture"&&host==="app.example.net";}});
    const transport=(async(_url,init)=>{
      const response=await issuer(new Request(site+"/api/download-access",{...init,headers:{"Content-Type":"application/json",Origin:site,Cookie:cookie}}));
      if(response.ok)cookie=response.headers.get("set-cookie")!.split(";")[0];return response;
    }) as typeof fetch;
    const client=new SecureDownloadClient(origin,transport);
    await assert.rejects(()=>client.authorize());
    await client.authorize("original-fixture");const grant=await client.grant();
    const claims=verifyAccess(grant,key,origin,"api");assert.equal(claims.exp-claims.iat,120);assert.ok(cookie.startsWith("__Host-vidfetch-access="));
    const proof=await client.proof("POST","/api/download",'{"type":"audio"}',grant);
    assert.ok(verifyProof(proof,claims.key,{method:"POST",path:"/api/download",body:'{"type":"audio"}',token:grant}));
    assert.throws(()=>verifyProof(proof,claims.key,{method:"POST",path:"/api/download",body:'{"type":"video"}',token:grant}));
    assert.throws(()=>verifyProof(proof,claims.key,{method:"GET",path:"/api/download",body:'{"type":"audio"}',token:grant}));
    await client.authorize();assert.equal(verifyAccess(await client.grant(),key,origin,"api").sub,claims.sub);assert.equal(verified,1);
    const thief=new SecureDownloadClient(origin,transport);await assert.rejects(()=>thief.authorize());
  });
  it("rejects changed signatures, audience, expiration, private JWKs and wrong keys",async()=>{
    const key=randomBytes(32), client=new SecureDownloadClient(origin);const jwk=await client.publicKey(),now=Math.floor(Date.now()/1000);
    const claims={iss:"vidfetch-access" as const,aud:origin,sub:randomUUID(),key:jwk,iat:now,exp:now+120,purpose:"api" as const};
    const grant=signAccess(claims,key);
    assert.throws(()=>verifyAccess(grant,key,site,"api"));assert.throws(()=>verifyAccess(grant,randomBytes(32),origin,"api"));
    assert.throws(()=>verifyAccess(signAccess({...claims,exp:now-1},key),key,origin,"api"));
    assert.throws(()=>verifyAccess(signAccess({...claims,exp:now+121},key),key,origin,"api"));
    assert.throws(()=>browserKey({...jwk,d:"private"}));assert.throws(()=>serviceKey("short"));
  });
  it("denies cross-origin requests and oversized bodies before challenge verification",async()=>{
    const issuer=createAccessIssuer({key:randomBytes(32),siteOrigin:site,gatewayOrigin:origin,verifyChallenge:async()=>{throw Error("must not run");}});
    assert.equal((await issuer(new Request(site,{method:"POST",headers:{Origin:"https://evil.example"},body:"{}"}))).status,403);
    assert.equal((await issuer(new Request(site,{method:"POST",headers:{Origin:site},body:"x".repeat(9000)}))).status,413);
  });
  it("persists quotas and replay protection, with conservative crash reservations",()=>{
    const file=join(mkdtempSync(join(tmpdir(),"vidfetch-ledger-")),"quota.sqlite");let ledger=new GatewayLedger(file);
    ledger.rate("ip","work",1,60000);assert.throws(()=>ledger.rate("ip","work",1,60000));
    ledger.useProof("owner","nonce");assert.throws(()=>ledger.useProof("owner","nonce"));
    for(let i=0;i<4;i++)ledger.reserve("ip","owner",256*1024**2);assert.throws(()=>ledger.reserve("ip","owner",256*1024**2));
    ledger.close();ledger=new GatewayLedger(file);assert.throws(()=>ledger.reserve("ip","owner",256*1024**2));assert.throws(()=>ledger.useProof("owner","nonce"));ledger.close();
  });
  it("refuses private control destinations and null authorization payloads",async()=>{
    for(const host of ["127.0.0.1","192.168.1.112","[::1]"])await assert.rejects(()=>publicJsonPost(new URL(`https://${host}/auth/admission`),"{}",{}),AccessError);
    assert.throws(()=>verifyAccess("bnVsbA.e30.AA",randomBytes(32),origin,"api"),AccessError);
    const client=new SecureDownloadClient(origin);assert.throws(()=>verifyProof("bnVsbA.AA",{kty:"EC",crv:"P-256",x:"x",y:"y"},{method:"GET",path:"/api/health",body:"",token:""}),AccessError);
    await assert.rejects(()=>client.request("https://evil.example/api/download"));
  });
});
