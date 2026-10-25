// ADB reverse on this Windows host connects via IPv4. Nuxt already listens on ::1:3000.
// Relay the same loopback port to the existing server; no second Nuxt instance or alternate port.
import { createServer, connect } from 'node:net';
const server = createServer((client) => {
  const upstream = connect({ host:'::1', port:3000 });
  client.pipe(upstream).pipe(client);
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
});
server.listen(3000,'127.0.0.1',()=>console.log(`LOT11_ADB_LOOPBACK pid=${process.pid} 127.0.0.1:3000 -> [::1]:3000`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
