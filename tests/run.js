#!/usr/bin/env node
/* Travel Marvel · test runner
 *
 * Starts a static server on the repo, runs every tests/<name>.test.js in
 * its own process, and reports. Each suite also runs standalone against
 * an already-running server, which is what you want while writing one.
 *
 *   node tests/run.js              all suites
 *   node tests/run.js store legs   just those
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TM_PORT || 8777);
const BASE = `http://localhost:${PORT}`;

function suites() {
  const want = process.argv.slice(2);
  const all = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.test.js'))
    .sort();
  if (!want.length) return all;
  return all.filter(f => want.some(w => f.startsWith(w)));
}

function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http.get(BASE + '/index.html', res => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('server did not start'));
      setTimeout(tryOnce, 120);
    };
    tryOnce();
  });
}

(async () => {
  const list = suites();
  if (!list.length) {
    console.error('no suites matched');
    process.exit(1);
  }

  const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: ROOT, stdio: 'ignore', detached: true
  });
  const stop = () => { try { process.kill(-server.pid); } catch (e) { /* already gone */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });

  try {
    await waitForServer(10000);
  } catch (e) {
    stop();
    console.error(e.message);
    process.exit(1);
  }

  let failed = 0;
  for (const file of list) {
    console.log('\n— ' + file.replace('.test.js', ''));
    const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
      stdio: 'inherit', env: Object.assign({}, process.env, { TM_BASE: BASE })
    });
    if (r.status !== 0) failed++;
  }

  stop();
  console.log('\n' + (failed ? `${failed} of ${list.length} suites failed` : `all ${list.length} suites passed`));
  process.exit(failed ? 1 : 0);
})();
