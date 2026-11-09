const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { MediaParser, FragmentedMP4 } = require('../src/media.cjs');
const { accessUnits, createFixtureRecorder } = require('./fixture-recorder.cjs');
const { ViewerManager } = require('../src/manager.cjs');

for (const codec of ['h264', 'h265']) test(codec + ': fragmented DVRIP frames produce decodable MP4', () => {
  const parser = new MediaParser(), mux = new FragmentedMP4(), pieces = [];
  let metadata;
  parser.on('video', frame => mux.push(frame)); mux.on('metadata', value => { metadata = value; }); mux.on('segment', data => pieces.push(data));
  for (const frame of accessUnits(path.join(__dirname, 'fixtures/video.' + codec), codec)) {
    // Split proprietary headers as well as video bodies; real TCP packet boundaries vary.
    for (let offset = 0; offset < frame.length; offset += 317) parser.push(frame.subarray(offset, offset + 317));
  }
  assert.equal(metadata.width, 640); assert.equal(metadata.height, 360); assert.equal(metadata.codec, codec);
  assert.ok(pieces.length > 60);
  const output = path.join(__dirname, '../output/' + codec + '-verified.mp4'); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, Buffer.concat(pieces));
  const localBinary = path.join(__dirname, '../tools/ffmpeg-runtime/ffmpeg.exe');
  const binary = process.env.FFMPEG || (fs.existsSync(localBinary) ? localBinary : 'ffmpeg');
  execFileSync(binary, ['-hide_banner', '-loglevel', 'error', '-i', output, '-f', 'null', '-'], { stdio: 'pipe' });
});

test('unreasonable frame lengths are rejected before allocating a body', () => {
  const parser = new MediaParser(), header = Buffer.alloc(16); header[2] = 1; header[3] = 0xfc; header.writeUInt32LE(0xffffffff, 12);
  assert.throws(() => parser.push(header), /большой/);
});

for (const codec of ['h264', 'h265']) test(codec + ': reordered pictures produce a clear unsupported-format error', () => {
  const parser = new MediaParser(), mux = new FragmentedMP4();
  parser.on('video', frame => mux.push(frame));
  assert.throws(() => {
    for (const frame of accessUnits(path.join(__dirname, 'fixtures/video-b.' + codec), codec)) parser.push(frame);
  }, /B-кадрами/);
});

test('full manager connects, lists channels, streams video, and queries fixture recordings', async t => {
  const fixture = await createFixtureRecorder({ filename: path.join(__dirname, 'fixtures/video.h264') });
  const credentialsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-manager-test-'));
  const manager = new ViewerManager({ credentialsDirectory });
  t.after(async () => {
    await manager.close(); await fixture.close();
    assert.ok(path.resolve(credentialsDirectory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(credentialsDirectory).startsWith('viewer-manager-test-'));
    fs.rmSync(credentialsDirectory, { recursive: true, force: true });
  });
  const connected = await manager.connect({ id: 'fixture', host: '127.0.0.1', port: fixture.port, username: fixture.username, password: fixture.password });
  assert.equal(connected.channels.length, 4);
  assert.equal(connected.model, 'Тестовый регистратор');
  const live = await manager.live({ id: 'fixture', channel: 0 });
  const controller = new AbortController(), response = await fetch(live.url, { signal: controller.signal });
  const reader = response.body.getReader(); let received = Buffer.alloc(0);
  while (received.length < 18000) { const result = await reader.read(); assert.equal(result.done, false); received = Buffer.concat([received, Buffer.from(result.value)]); }
  assert.equal(received[0], 1); const length = received.readUInt32BE(1), meta = JSON.parse(received.subarray(5, length + 5));
  assert.equal(meta.codec, 'h264'); assert.equal(meta.width, 640);
  controller.abort(); await manager.stop();
  const archive = await manager.archive({ id: 'fixture', channel: 0, begin: '2026-11-04 00:00:00', end: '2026-11-04 23:59:59' });
  assert.equal(archive.files.length, 1); assert.equal(archive.truncated, false);
  assert.ok(fixture.commands.includes(1048)); assert.ok(!fixture.commands.includes(1046));
  assert.throws(() => manager.playback({ id: 'fixture', key: 'unknown-file' }), /Найдите/);
});
