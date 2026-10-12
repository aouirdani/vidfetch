// Only the separate proxy UID may connect to loopback 8788 in the namespace.
import { createServer, connect } from "node:net";
import { chmod, stat } from "node:fs/promises";
const path=process.env.VIDFETCH_BACKEND_SOCKET;
if(!path?.startsWith("/run/vidfetch-public/")||process.env.VIDFETCH_PUBLIC_WORKER_ENABLED!=="1")throw Error("Socket proxy activation disabled");
try { await stat(path);throw Error("Existing socket path; refusing overwrite"); } catch(error){if(error.code!=="ENOENT")throw error;}
const connections=new Set();
const server=createServer(client=>{
  const backend=connect(8788,"127.0.0.1");connections.add(client);connections.add(backend);
  const close=()=>{client.destroy();backend.destroy();connections.delete(client);connections.delete(backend);};
  client.on("error",close);backend.on("error",close);client.on("close",close);backend.on("close",close);
  client.setTimeout(600000,close);backend.setTimeout(600000,close);client.pipe(backend).pipe(client);
});
server.maxConnections=32;
server.listen(path,()=>void chmod(path,0o660));
for(const signal of ["SIGTERM","SIGINT"])process.once(signal,()=>{for(const socket of connections)socket.destroy();server.close();});
