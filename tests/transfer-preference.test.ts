import {test} from "node:test";
import assert from "node:assert/strict";
import {transferMode,applyTransferPreference,TRANSFER_PREFERENCE_SECONDS} from "../src/lib/transfer-mode";

test("direct is opt-in only, preference expires after seven days, popup reverses it",()=>{
  assert.equal(transferMode(""),"popup");
  assert.equal(transferMode("other=direct; vidfetch-transfer-mode=unknown"),"popup");
  assert.equal(transferMode("vidfetch-transfer-mode=directly"),"popup");
  assert.equal(transferMode("other=x; vidfetch-transfer-mode=direct"),"direct");
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,"window"),oldDocument=Object.getOwnPropertyDescriptor(globalThis,"document");
  let written="";
  const location={origin:"https://vidfetch.app",pathname:"/",search:"?transfer=direct"};
  Object.defineProperty(globalThis,"window",{value:{location},configurable:true});
  Object.defineProperty(globalThis,"document",{value:{set cookie(value:string){written=value;}},configurable:true});
  try{
    applyTransferPreference();assert.match(written,/^vidfetch-transfer-mode=direct;/);assert.match(written,/Max-Age=604800; Path=\/; Secure; SameSite=Lax$/);assert.equal(TRANSFER_PREFERENCE_SECONDS,604800);
    location.search="?transfer=popup";applyTransferPreference();assert.match(written,/^vidfetch-transfer-mode=popup;/);
    for(const [origin,pathname,search]of [["https://vidfetch.app","/","?transfer=unknown"],["https://other.example","/","?transfer=direct"],["https://vidfetch.app","/fr","?transfer=direct"]]){
      Object.assign(location,{origin,pathname,search});written="";applyTransferPreference();assert.equal(written,"");
    }
  }finally{
    if(oldWindow)Object.defineProperty(globalThis,"window",oldWindow);else Reflect.deleteProperty(globalThis,"window");
    if(oldDocument)Object.defineProperty(globalThis,"document",oldDocument);else Reflect.deleteProperty(globalThis,"document");
  }
});
