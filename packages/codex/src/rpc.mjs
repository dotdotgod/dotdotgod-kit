import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export function codexRpc(binary, { cwd, env = process.env, args = [], onNotification = () => {} } = {}) {
  const child = spawn(binary, [...args, 'app-server', '--stdio'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let id = 0;
  let errors = '';
  child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-2000); });
  const fail = error => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); };
  child.on('error', fail);
  child.on('exit', code => fail(new Error(`Codex app-server exited ${code}: ${errors}`)));
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.method) { onNotification(message); return; }
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  });
  function call(method, params) {
    return new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Codex ${method} timed out`)); }, 15000);
      pending.set(key, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id: key, method, params })}\n`);
    });
  }
  return {
    call,
    async initialize() {
      await call('initialize', { clientInfo: { name: 'dotdotgod-plan-setup', version: '0.6.6' }, capabilities: { experimentalApi: true } });
      child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
    },
    close() { lines.close(); child.stdin.end(); child.kill('SIGTERM'); fail(new Error('RPC closed')); },
  };
}
