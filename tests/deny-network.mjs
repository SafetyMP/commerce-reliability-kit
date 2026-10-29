// Test-only tripwire. No attempted call reaches an operating-system socket or resolver.
import { createRequire, syncBuiltinESMExports } from 'node:module';
const require = createRequire(import.meta.url);
let attempts = 0;
const deny = () => { attempts++; throw new Error('Runtime network denied'); };
for (const [name, methods] of Object.entries({
  http: ['request', 'get', 'createServer'], https: ['request', 'get', 'createServer'],
  net: ['connect', 'createConnection', 'createServer'], tls: ['connect', 'createServer'],
  dgram: ['createSocket'], dns: ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'reverse']
})) {
  const module = require('node:' + name);
  for (const method of methods) module[method] = deny;
  if (name === 'net') module.Socket.prototype.connect = deny;
  if (name === 'dns') for (const key of Object.keys(module.promises)) if (typeof module.promises[key] === 'function') module.promises[key] = deny;
}
globalThis.fetch = deny;
globalThis.WebSocket = class { constructor() { deny(); } };
syncBuiltinESMExports();
process.on('exit', () => { if (attempts) process.exitCode = 91; });
