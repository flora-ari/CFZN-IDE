// Real compile-only HTTP verification. Never enumerates, opens or uploads to a serial port.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { createHardwareApp } from '../dist/hardware/app.js';
import { loadHardwareConfig } from '../dist/hardware/config.js';

Logger.overrideLogger(false);
const config = await loadHardwareConfig();
const app = await createHardwareApp(config);
await app.listen(0, '127.0.0.1');
const base = `${await app.getUrl()}/api/v1/hardware`;
const results = [];
async function wait(job) {
  let cursor = 0;
  while (true) {
    const response = await fetch(`${base}/jobs/${job.id}?afterLog=${cursor}`);
    assert.equal(response.status, 200);
    const state = await response.json();
    for (const entry of state.logs) process.stdout.write(entry.text);
    cursor = state.nextLog;
    if (state.job.stage === 'complete') return state.job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
try {
  const capabilities = await (await fetch(`${base}/capabilities`)).json();
  console.log(JSON.stringify(capabilities, null, 2));
  const profileIds = process.argv.slice(2);
  for (const id of profileIds.length ? profileIds : ['esp32-4mb-dio', 'firebeetle-esp32e-4mb']) {
    const profile = capabilities.profiles.find((value) => value.id === id);
    assert.ok(profile?.compileAvailable, `Required real compile profile unavailable: ${id}: ${profile?.reason}`);
    const code = '#include <Arduino.h>\nvoid setup() { Serial.begin(115200); Serial.println("CFZN_HW_V02_COMPILE_ONLY"); }\nvoid loop() { if (Serial.available()) Serial.write(Serial.read()); delay(1); }\n';
    const response = await fetch(`${base}/builds`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: profile.deviceId, profileId: id, code, moduleIds: [] }) });
    assert.equal(response.status, 202, await response.clone().text());
    const job = await wait((await response.json()).job);
    results.push({ profile, job });
    assert.equal(job.state, 'succeeded', JSON.stringify(job));
  }
  // A genuine diagnostic from the selected compiler must become COMPILE_FAILED.
  const first = capabilities.profiles.find((value) => value.id === (profileIds[0] ?? 'esp32-4mb-dio'));
  const bad = await fetch(`${base}/builds`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: first.deviceId, profileId: first.id, code: '#error CFZN_EXPECTED_COMPILER_DIAGNOSTIC\nvoid setup() {}\nvoid loop() {}\n' }) });
  assert.equal(bad.status, 202);
  const failed = await wait((await bad.json()).job);
  assert.equal(failed.state, 'failed');
  assert.equal(failed.error.code, 'COMPILE_FAILED');
  results.push({ expectedFailure: failed });
  await mkdir(config.runtimeDir, { recursive: true });
  await writeFile(join(config.runtimeDir, 'verification-summary.json'), JSON.stringify({
    verifiedAt: new Date().toISOString(), node: process.version, capabilities, results,
    serialAccess: 'none; compile-only', evidenceRoot: join(config.runtimeDir, 'jobs'),
  }, null, 2));
  console.log(`Compile-only evidence: ${join(config.runtimeDir, 'verification-summary.json')}`);
} finally { await app.close(); }
