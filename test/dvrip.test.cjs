const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { DvripClient, passwordHash } = require('../src/dvrip.cjs');

function reply(command, body) {
  const data = Buffer.from(JSON.stringify(body) + '\n\0');
  const header = Buffer.alloc(20);
  header[0] = 255;
  header.writeUInt32LE(42, 4);
  header.writeUInt16LE(command, 14);
  header.writeUInt32LE(data.length, 16);
  return Buffer.concat([header, data]);
}

async function fakeRecorder(t, handler, timeout = 1000) {
  const sockets = new Set();
  const requests = [];
  const server = net.createServer(socket => {
    sockets.add(socket);
    let buffer = Buffer.alloc(0);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length >= 20) {
        const size = buffer.readUInt32LE(16);
        if (buffer.length < size + 20) return;
        const command = buffer.readUInt16LE(14);
        const session = buffer.readUInt32LE(4);
        const body = JSON.parse(buffer.subarray(20, size + 20).toString().replace(/[\x00\r\n]+$/, ''));
        buffer = buffer.subarray(size + 20);
        requests.push({ command, session, body });
        handler({ command, session, body, socket });
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new DvripClient({ host: '127.0.0.1', port: server.address().port, timeout });
  t.after(async () => {
    client.close();
    sockets.forEach(socket => socket.destroy());
    await new Promise(resolve => server.close(resolve));
  });
  await client.connect();
  return { client, requests };
}

const loginOK = { Ret: 100, SessionID: '0x0000002a', AliveInterval: 60, 'DeviceType ': 'HVR' };

test('known XM password digest is compatible with the SDK', () => {
  assert.equal(passwordHash(''), 'tlJwpbo6');
  assert.equal(passwordHash('admin'), '6QNMIQGe');
});

test('TCP fragmentation and unrelated events preserve the correct response', async t => {
  const { client, requests } = await fakeRecorder(t, ({ command, body, session, socket }) => {
    if (command === 1000) {
      const response = reply(1001, loginOK);
      socket.write(response.subarray(0, 7));
      setTimeout(() => socket.write(response.subarray(7, 22)), 5);
      setTimeout(() => socket.write(response.subarray(22)), 10);
    } else {
      assert.equal(session, 42);
      assert.equal(body.SessionID, '0x0000002a');
      socket.write(Buffer.concat([
        reply(1504, { Name: 'AlarmInfo', Ret: 100 }),
        reply(1021, { Ret: 100, SystemInfo: { VideoInChannel: 16, HardWare: 'fixture' } })
      ]));
    }
  });
  assert.deepEqual(await client.login('fixture-user', 'fixture-password'), { deviceType: 'HVR' });
  assert.equal((await client.systemInfo()).VideoInChannel, 16);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.PassWord.length, 8);
  assert.ok(!JSON.stringify(requests).includes('fixture-password'));
});

test('wrong credentials are reported once without retries', async t => {
  const { client, requests } = await fakeRecorder(t, ({ socket }) => socket.write(reply(1001, { Ret: 203 })));
  await assert.rejects(client.login('fixture-user', 'fixture-password'), error => error.code === 203);
  assert.equal(requests.length, 1);
  assert.equal(client.authenticated, false);
});

test('archive permission errors are not presented as an empty archive', async t => {
  const { client } = await fakeRecorder(t, ({ command, socket }) => socket.write(reply(command + 1,
    command === 1000 ? loginOK : { Ret: 107 })));
  await client.login('fixture-user', 'fixture-password');
  await assert.rejects(client.searchArchive({ channel: 0, begin: '2026-11-04 00:00:00', end: '2026-11-04 23:59:59' }), error => error.code === 107);
});

test('overlapping archive pages are deduplicated and repeated cursors stop', async t => {
  const rows = Array.from({ length: 64 }, (_, index) => ({
    FileName: 'fixture-' + index,
    BeginTime: '2026-11-04 00:' + String(index % 60).padStart(2, '0') + ':00',
    EndTime: '2026-11-04 01:00:00'
  }));
  const { client, requests } = await fakeRecorder(t, ({ command, socket }) => socket.write(reply(command + 1,
    command === 1000 ? loginOK : { Ret: 111, OPFileQuery: rows })));
  await client.login('fixture-user', 'fixture-password');
  const result = await client.searchArchive({ channel: 0, begin: '2026-11-04 00:00:00', end: '2026-11-04 23:59:59' });
  assert.equal(result.files.length, 64);
  assert.equal(result.truncated, true);
  assert.equal(requests.filter(item => item.command === 1440).length, 2);
});

test('invalid calendar dates are rejected before any recorder query', async t => {
  const { client, requests } = await fakeRecorder(t, ({ command, socket }) => socket.write(reply(command + 1, loginOK)));
  await client.login('fixture-user', 'fixture-password');
  await assert.rejects(client.searchArchive({ channel: 0, begin: '2026-02-31 00:00:00', end: '2026-03-01 00:00:00' }));
  assert.equal(requests.length, 1);
});

test('oversized frames terminate the connection without waiting for a body', async t => {
  const { client } = await fakeRecorder(t, ({ socket }) => {
    const header = Buffer.alloc(20); header[0] = 255; header.writeUInt16LE(1001, 14); header.writeUInt32LE(0x7fffffff, 16);
    socket.write(header);
  });
  await assert.rejects(client.login('fixture-user', 'fixture-password'), /размер/);
});

test('missing responses time out and reject queued requests', async t => {
  const { client } = await fakeRecorder(t, () => {}, 60);
  const first = client.request(1000, {});
  const queued = client.request(1020, { Name: 'SystemInfo' });
  const results = await Promise.allSettled([first, queued]);
  assert.deepEqual(results.map(item => item.status), ['rejected', 'rejected']);
});
