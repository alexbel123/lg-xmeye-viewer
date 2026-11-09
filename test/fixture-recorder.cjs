'use strict';
const fs = require('fs');
const net = require('net');
const { passwordHash } = require('../src/dvrip.cjs');
const { splitNALs } = require('../src/media.cjs');
const FPS = 12;
const USERNAME = 'test-viewer';
const PASSWORD = 'synthetic-fixture-only';

function wire(command, data) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data) + '\n\0');
  const header = Buffer.alloc(20); header[0] = 255;
  header.writeUInt32LE(42, 4); header.writeUInt16LE(command, 14); header.writeUInt32LE(body.length, 16);
  return Buffer.concat([header, body]);
}
function accessUnits(filename, codec = 'h264') {
  const nals = splitNALs(fs.readFileSync(filename));
  const frames = [];
  let current = [];
  function flush() {
    if (!current.length) return;
    const types = current.map(nal => codec === 'h264' ? nal[0] & 31 : (nal[0] >> 1) & 63);
    const hasVideo = types.some(type => codec === 'h264' ? type === 1 || type === 5 : type <= 31);
    if (!hasVideo) return;
    const key = types.some(type => codec === 'h264' ? type === 5 : type >= 16 && type <= 23);
    const data = Buffer.concat(current.map(nal => Buffer.concat([Buffer.from([0, 0, 0, 1]), nal])));
    const header = Buffer.alloc(key ? 16 : 8); header[2] = 1; header[3] = key ? 0xfc : 0xfd;
    if (key) { header[4] = codec === 'h264' ? 2 : 3; header[5] = FPS; header[6] = 80; header[7] = 45; header.writeUInt32LE(data.length, 12); }
    else header.writeUInt32LE(data.length, 4);
    frames.push(Buffer.concat([header, data]));
  }
  for (const nal of nals) {
    const type = codec === 'h264' ? nal[0] & 31 : (nal[0] >> 1) & 63;
    if (type === (codec === 'h264' ? 9 : 35)) { flush(); current = []; }
    current.push(nal);
  }
  flush();
  if (!frames.length) throw new Error('Test video must contain access-unit delimiters');
  return frames;
}

async function createFixtureRecorder({ filename, codec = 'h264', port = 0, username = USERNAME, password = PASSWORD, claimDelay = 0, rejectReclaim = false, closeOnStop = false, failChannels = [], aliveInterval = 60 }) {
  const frames = accessUnits(filename, codec), sockets = new Set(), commands = [], requests = [];
  let connectionCount = 0;
  const server = net.createServer(socket => {
    const connection = ++connectionCount, delayed = new Set(); let claimed = false;
    sockets.add(socket);
    let buffer = Buffer.alloc(0), interval = null;
    const stop = () => { clearInterval(interval); interval = null; };
    socket.on('error', () => {}); socket.on('close', () => { stop(); sockets.delete(socket); for (const timer of delayed) clearTimeout(timer); });
    function stream(playback) {
      stop(); let index = 0;
      interval = setInterval(() => {
        if (socket.destroyed) return stop();
        const frame = frames[index++];
        for (let offset = 0; offset < frame.length; offset += 4096) socket.write(wire(playback ? 1422 : 1412, frame.subarray(offset, offset + 4096)));
        if (index === frames.length) {
          if (playback) { socket.write(wire(1422, Buffer.alloc(0))); stop(); }
          else index = 0;
        }
      }, Math.round(1000 / FPS));
    }
    socket.on('data', data => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length >= 20) {
        const size = buffer.readUInt32LE(16);
        if (buffer.length < size + 20) return;
        const command = buffer.readUInt16LE(14);
        const body = JSON.parse(buffer.subarray(20, size + 20).toString().replace(/[\x00\r\n]+$/, ''));
        buffer = buffer.subarray(size + 20); commands.push(command);
        requests.push({connection,command,action:body.OPMonitor?.Action,channel:body.OPMonitor?.Parameter?.Channel});
        let response = { Ret: 100 };
        if (command === 1000) response = body.UserName === username && body.PassWord === passwordHash(password) ? { Ret: 100, SessionID: '0x0000002a', AliveInterval: aliveInterval, 'DeviceType ': 'SYNTHETIC TEST' } : { Ret: 203 };
        else if (command === 1020) response.SystemInfo = { VideoInChannel: 4, HardWare: 'Тестовый регистратор', SoftWareVersion: 'SYNTHETIC FIXTURE' };
        else if (command === 1048) response.ChannelTitle = ['Тестовая камера 1', 'Тестовая камера 2', 'Тестовая камера 3', 'Тестовая камера 4'];
        else if (command === 1452) response.OPTimeQuery = '2026-11-04 12:00:00';
        else if (command === 1440) { response.Ret = 110; response.OPFileQuery = [{ FileName: 'synthetic-video', BeginTime: '2026-11-04 12:00:00', EndTime: '2026-11-04 12:00:06' }]; }
        if (command === 1413) {
          if (claimed && rejectReclaim) { socket.destroy(); continue; }
          claimed = true;
          if (claimDelay) { const timer=setTimeout(() => { delayed.delete(timer); if (!socket.destroyed) socket.write(wire(command+1,response)); },claimDelay); delayed.add(timer); continue; }
        }
        if (command === 1410 && body.OPMonitor.Action === 'Start' && failChannels.includes(body.OPMonitor.Parameter.Channel)) { socket.write(wire(1411,{Ret:502})); continue; }
        socket.write(wire(command + 1, response));
        if (command === 1410 && body.OPMonitor.Action === 'Start') stream(false);
        if (command === 1420 && body.OPPlayBack.Action === 'Start') stream(true);
        if ((command === 1410 && body.OPMonitor.Action === 'Stop') || (command === 1420 && body.OPPlayBack.Action === 'Stop')) { stop(); if (closeOnStop) socket.destroy(); }
      }
    });
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { port: server.address().port, username, password, frames, commands, requests,
    close: async () => { sockets.forEach(socket => socket.destroy()); await new Promise(resolve => server.close(resolve)); }
  };
}
module.exports = { createFixtureRecorder, accessUnits };
if (require.main === module) {
  const path = require('path');
  const codec = process.argv[2] === 'h265' ? 'h265' : 'h264';
  createFixtureRecorder({ filename: path.join(__dirname, 'fixtures/video.' + codec), codec, port: Number(process.argv[3]) || 19429 }).then(fixture => {
    console.log('SYNTHETIC test recorder: 127.0.0.1:' + fixture.port);
    process.on('SIGTERM', () => fixture.close().finally(() => process.exit(0)));
    process.on('SIGINT', () => fixture.close().finally(() => process.exit(0)));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
