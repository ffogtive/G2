// run.mjs — jobs.json 을 W 일꾼으로 돌려 out.jsonl 에. 사용: node run.mjs jobs.json out.jsonl [W=2]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
if (!isMainThread) {
  const L = await import('./lib.mjs');
  await L.SW.initPhysics();
  parentPort.on('message', (job) => { if (job === null) process.exit(0); const r = L.shot(job); parentPort.postMessage({ ...r, key: job.key }); });
  parentPort.postMessage({ ready: true });
} else {
  const [jf, of, Ws] = process.argv.slice(2);
  const jobs = JSON.parse(readFileSync(jf, 'utf8'));
  const W = +(Ws || 2);
  const done = new Set();
  if (existsSync(of)) for (const l of readFileSync(of, 'utf8').split('\n')) if (l) { const r = JSON.parse(l); done.add(r.key + '|' + r.seed + '|' + r.n); }
  const todo = jobs.filter((j) => !done.has(j.key + '|' + j.seed + '|' + j.n));
  console.error(`jobs ${jobs.length}, todo ${todo.length}, workers ${W}`);
  let k = 0, fin = 0; const t0 = Date.now();
  await new Promise((res) => {
    let alive = W;
    for (let w = 0; w < W; w++) {
      const wk = new Worker(new URL(import.meta.url), { workerData: {} });
      const next = () => { if (k < todo.length) wk.postMessage(todo[k++]); else { wk.postMessage(null); } };
      wk.on('message', (m) => { if (m.ready) return next(); appendFileSync(of, JSON.stringify(m) + '\n'); fin++; if (fin % 50 === 0) console.error(`${fin}/${todo.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`); next(); });
      wk.on('exit', () => { if (--alive === 0) res(); });
      wk.on('error', (e) => { console.error(e); });
    }
  });
  console.error(`done ${fin} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
