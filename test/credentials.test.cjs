const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { CredentialStore } = require('../src/credentials.cjs');
const { passwordHash } = require('../src/dvrip.cjs');
const { ViewerManager } = require('../src/manager.cjs');
const { createFixtureRecorder } = require('./fixture-recorder.cjs');

async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'viewer-credentials-test-'));
  t.after(async () => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(dir).startsWith('viewer-credentials-test-'));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test('different recorder accounts survive a store restart without plaintext secrets', async t => {
  const dir = await directory(t), store = new CredentialStore(dir);
  await Promise.all([
    store.set({ id: 'device-a', username: 'first-user', password: 'first-private-test' }),
    store.set({ id: 'device-b', username: 'second-user', password: 'second-private-test' })
  ]);
  const bytes = await fs.readFile(store.file, 'utf8');
  for (const secret of ['first-private-test', 'second-private-test', 'first-user', 'second-user', passwordHash('first-private-test')]) assert.ok(!bytes.includes(secret));
  const restarted = new CredentialStore(dir);
  assert.deepEqual(await restarted.list(), [{ id: 'device-a', username: 'first-user', saved: true }, { id: 'device-b', username: 'second-user', saved: true }]);
  assert.equal((await restarted.get('device-a')).hash, passwordHash('first-private-test'));
  assert.equal((await restarted.get('device-b')).hash, passwordHash('second-private-test'));
  const key = await fs.readFile(store.keyFile);
  assert.equal(key.subarray(0, process.platform === 'win32' ? 7 : 5).toString(), process.platform === 'win32' ? 'DPAPI1\n' : 'KEY1\n');
});

test('editing or deleting one account preserves the other recorder', async t => {
  const store = new CredentialStore(await directory(t));
  await store.set({ id: 'a', username: 'alpha', password: 'alpha-test' });
  await store.set({ id: 'b', username: 'beta', password: 'beta-test' });
  await store.set({ id: 'a', username: 'alpha-renamed', keepPassword: true });
  assert.equal((await store.get('a')).hash, passwordHash('alpha-test'));
  await store.set({ id: 'a', username: 'alpha-renamed', password: 'new-alpha-test' });
  assert.equal((await store.get('a')).hash, passwordHash('new-alpha-test'));
  assert.equal((await store.get('b')).hash, passwordHash('beta-test'));
  await store.delete('a');
  assert.equal(await store.get('a'), null);
  assert.equal((await new CredentialStore(store.directory).get('b')).hash, passwordHash('beta-test'));
});

test('an intentionally empty password is saved, and unspecified passwords are not invented', async t => {
  const store = new CredentialStore(await directory(t));
  await store.set({ id: 'empty', username: 'user', password: '' });
  assert.equal((await new CredentialStore(store.directory).get('empty')).hash, passwordHash(''));
  await assert.rejects(store.set({ id: 'unknown', username: 'user', keepPassword: true }), /Введите пароль/);
  assert.equal(await store.get('unknown'), null);
});

test('damaged encrypted data is reported and never silently reset', async t => {
  const dir = await directory(t), store = new CredentialStore(dir);
  await store.set({ id: 'a', username: 'user', password: 'private-test' });
  const envelope = JSON.parse(await fs.readFile(store.file, 'utf8'));
  const data = Buffer.from(envelope.data, 'base64'); data[0] ^= 1; envelope.data = data.toString('base64');
  const damaged = JSON.stringify(envelope); await fs.writeFile(store.file, damaged);
  const restarted = new CredentialStore(dir);
  await assert.rejects(restarted.list(), /расшифровать/);
  await assert.rejects(restarted.set({ id: 'b', username: 'other', password: 'other-test' }), /расшифровать/);
  assert.equal(await fs.readFile(store.file, 'utf8'), damaged);
});

test('saved authorization works independently for two recorders after manager restart', async t => {
  const dir = await directory(t);
  const filename = path.join(__dirname, 'fixtures/video.h264');
  const a = await createFixtureRecorder({ filename, username: 'first-user', password: 'first-test-only' });
  const b = await createFixtureRecorder({ filename, username: 'second-user', password: 'second-test-only' });
  let manager = new ViewerManager({ credentialsDirectory: dir });
  t.after(async () => { await manager.close(); await a.close(); await b.close(); });
  await manager.saveCredentials({ id: 'a', username: a.username, password: a.password });
  await manager.saveCredentials({ id: 'b', username: b.username, password: b.password });
  await manager.close();
  manager = new ViewerManager({ credentialsDirectory: dir });
  const first = await manager.connect({ id: 'a', host: '127.0.0.1', port: a.port, useSaved: true });
  const second = await manager.connect({ id: 'b', host: '127.0.0.1', port: b.port, useSaved: true });
  assert.equal(first.connected, true); assert.equal(second.connected, true);
  const metadata = await manager.credentialsInfo();
  assert.deepEqual(metadata.credentials.map(account => account.username), ['first-user', 'second-user']);
  assert.ok(!JSON.stringify(metadata).includes('hash'));
  await assert.rejects(manager.connect({ id: 'b', host: '127.0.0.1', port: b.port, username: b.username, password: 'wrong-test-only' }), error => error.code === 203);
  assert.equal((await manager.connect({ id: 'b', host: '127.0.0.1', port: b.port, useSaved: true })).connected, true);
  await manager.forgetCredentials({ id: 'a' });
  assert.deepEqual((await manager.credentialsInfo()).credentials.map(account => account.id), ['b']);
  assert.equal(manager.status().devices.find(device => device.id === 'b').connected, true);
});
