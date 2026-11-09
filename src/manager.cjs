'use strict';
const http = require('http');
const crypto = require('crypto');
const { DvripClient, passwordHash } = require('./dvrip.cjs');
const { MediaParser, FragmentedMP4 } = require('./media.cjs');
const { CredentialStore } = require('./credentials.cjs');
const { SettingsStore } = require('./settings.cjs');
const MAX_STREAMS = 6;

function message(kind, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const header = Buffer.alloc(5); header[0] = kind; header.writeUInt32BE(data.length, 1);
  return Buffer.concat([header, data]);
}

class ViewerManager {
  constructor(options = {}) {
    this.credentials = options.credentialStore || new CredentialStore(options.credentialsDirectory);
    this.settings = new SettingsStore(this.credentials.directory);
    this.devices = new Map(); this.tokens = new Map(); this.server = null;
    this.connecting = new Map();
    this.port = null; this.streams = new Map(); this.opening = null;
    this.methods = ['bootstrap', 'connect', 'disconnect', 'status', 'live', 'archive', 'playback', 'stop', 'credentialsInfo', 'saveCredentials', 'forgetCredentials', 'saveSettings'];
  }

  async bootstrap() {
    if (!this.opening) this.opening = new Promise((resolve, reject) => {
      this.server = http.createServer((request, response) => this._http(request, response));
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => { this.port = this.server.address().port; resolve(); });
    });
    await this.opening;
    return { version: '0.4.1', native: true, maxStreams: MAX_STREAMS, videoCodecs: ['H.264', 'H.265'], audio: false, credentials: await this.credentials.list(), settings: await this.settings.get() };
  }

  async saveSettings(parameters) { await this.settings.set(parameters); return { saved:true }; }

  async credentialsInfo({ id } = {}) {
    const credentials = await this.credentials.list();
    return { credentials: id ? credentials.filter(account => account.id === id) : credentials };
  }

  async saveCredentials(parameters) { return { credential: await this.credentials.set(parameters) }; }

  async forgetCredentials({ id }) {
    await this.disconnect({ id });
    return { credential: await this.credentials.delete(id) };
  }

  _device(id) {
    const device = this.devices.get(id);
    if (!device || !device.client.authenticated) throw new Error('Войдите в регистратор');
    return device;
  }

  async connect({ id, host, port, username, password, channelCount, useSaved = false, remember = true }) {
    if (typeof id !== 'string' || id.length > 80) throw new Error('Некорректное устройство');
    await this.disconnect({ id });
    const client = new DvripClient({ host, port: Number(port) || 34567, timeout: 8000 });
    this.connecting.set(id, client);
    try {
      await client.connect();
      let account = null;
      if (useSaved) { account = await this.credentials.get(id); if (!account) throw new Error('Для этого регистратора ещё не сохранены данные входа'); }
      const login = account ? await client.loginWithHash(account.username, account.hash) : await client.login(username, password);
      const info = await client.systemInfo();
      let titles = [];
      try {
        const data = await client.channelTitles();
        titles = Array.isArray(data) ? data : Array.isArray(data.ChannelTitle) ? data.ChannelTitle : [];
      } catch (_) {}
      const reported = Math.max(Number(info.VideoInChannel) || 0, Number(info.DigChannel) || 0, Number(info.ChannelNum) || 0, titles.length);
      const count = Number(channelCount) > 0 ? Number(channelCount) : reported;
      if (!Number.isInteger(count) || count < 1 || count > 256) throw new Error('Не удалось определить число каналов. Укажите его в настройках устройства');
      const channels = Array.from({ length: count }, (_, index) => ({
        index, name: typeof titles[index] === 'string' ? titles[index] : (titles[index] && (titles[index].Name || titles[index].Title)) || 'Камера ' + (index + 1)
      }));
      if (this.connecting.get(id) !== client) throw new Error('Подключение отменено');
      // Keep only the login digest in memory for independent media sessions.
      // The control socket never carries media or receives media Stop commands.
      const auth = account || { username: username.trim(), hash: passwordHash(password) };
      const device = { id, host, port: client.port, auth, client, channels, files: new Map(), model: String(info.HardWare || info.Hardware || info.DeviceType || login.deviceType || 'XMEye'), firmware: String(info.SoftWareVersion || info.SoftwareVersion || '') };
      let credential = account ? { id, username: account.username, saved: true } : null, credentialsError = null;
      if (!useSaved && remember) {
        try { credential = await this.credentials.set({ id, username, password }); }
        catch (error) { credentialsError = error.message; }
      }
      if (this.connecting.get(id) !== client) throw new Error('Подключение отменено');
      this.devices.set(id, device);
      return { id, host, channels, model: device.model, firmware: device.firmware, connected: true, credential, credentialsError };
    } catch (error) { client.close(); throw error; }
    finally { if (this.connecting.get(id) === client) this.connecting.delete(id); }
  }

  async disconnect({ id }) {
    const pending = this.connecting.get(id);
    if (pending) { pending.close(); this.connecting.delete(id); }
    for (const stream of [...this.streams.values()]) if (stream.id === id) this._release(stream);
    const device = this.devices.get(id);
    if (device) { device.client.close(); device.auth = null; }
    this.devices.delete(id);
    for (const [token, value] of this.tokens) if (value.id === id) { clearTimeout(value.timer); this.tokens.delete(token); }
    return { disconnected: true };
  }

  status() {
    const streams = [...this.streams.values()].map(({id, slot, mode, channel}) => ({id, slot, mode, channel}));
    return { devices: [...this.devices.values()].map(device => ({ id: device.id, connected: device.client.authenticated })), playing: streams[0] || null, streams };
  }

  _release(stream) {
    if (this.streams.get(stream.slot) === stream) this.streams.delete(stream.slot);
    clearTimeout(stream.timer); this.tokens.delete(stream.token);
    if (stream.cleanup) stream.cleanup();
  }

  async _prepare(id, details, slot = 'main') {
    this._device(id);
    if (typeof slot !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(slot)) throw new Error('Некорректное окно камеры');
    const old = this.streams.get(slot);
    if (!old && this.streams.size >= MAX_STREAMS) throw new Error('Одновременно можно открыть до шести камер');
    if (old) this._release(old);
    const token = crypto.randomBytes(24).toString('hex');
    const source = { id, slot, token, ...details };
    const timer = setTimeout(() => this._release(source), 30000);
    if (timer.unref) timer.unref();
    source.timer = timer; this.streams.set(slot, source); this.tokens.set(token, source);
    await this.bootstrap();
    if (this.streams.get(slot) !== source) throw new Error('Переключение камеры отменено');
    return { url: 'http://127.0.0.1:' + this.port + '/media/' + token, lease: token, slot };
  }

  live({ id, channel, quality = 'Extra1', slot = 'main', software = false }) {
    const device = this._device(id);
    if (!Number.isInteger(channel) || !device.channels[channel]) throw new Error('Выберите канал');
    if (!['Main', 'Extra1'].includes(quality)) throw new Error('Неизвестное качество');
    return this._prepare(id, { mode: 'live', channel, quality, software: software === true }, slot);
  }

  async archive({ id, channel, begin, end, append = false }) {
    const device = this._device(id);
    if (!device.channels[channel]) throw new Error('Выберите канал');
    const result = await device.client.searchArchive({ channel, begin, end, maxPages: 2 });
    if (!append) device.files.clear();
    const files = result.files.map(file => {
      const key = crypto.createHash('sha256').update(JSON.stringify([file.FileName, file.BeginTime, file.EndTime])).digest('hex').slice(0, 24);
      device.files.set(key, file);
      return { key, begin: file.BeginTime, end: file.EndTime };
    });
    return { files, truncated: result.truncated, nextBegin: result.nextBegin || null };
  }

  playback({ id, key, slot = 'main' }) {
    const device = this._device(id), file = device.files.get(key);
    if (!file) throw new Error('Найдите запись в списке ещё раз');
    return this._prepare(id, { mode: 'playback', file }, slot);
  }

  async stop({ slot, lease } = {}) {
    if (slot !== undefined) {
      const stream = this.streams.get(slot);
      if (stream && (!lease || stream.token === lease)) this._release(stream);
    } else for (const stream of [...this.streams.values()]) this._release(stream);
    return { stopped: true };
  }

  _http(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' || !request.url || !request.url.startsWith('/media/')) { response.writeHead(404); response.end(); return; }
    const token = request.url.slice(7), source = this.tokens.get(token);
    if (!source) { response.writeHead(404); response.end(); return; }
    this.tokens.delete(token); clearTimeout(source.timer);
    let device;
    try { device = this._device(source.id); } catch (_) { response.writeHead(410); response.end(); return; }
    if (this.streams.get(source.slot) !== source) { response.writeHead(410); response.end(); return; }
    const client = new DvripClient({host: device.host, port: device.port, timeout: 8000});
    const parser = new MediaParser(), mux = new FragmentedMP4();
    let ended = false, firstFrame = false;
    response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    response.flushHeaders();
    let timeout = setTimeout(() => fail(new Error('Нет видеокадров. Попробуйте другой канал или качество')), 15000);
    const send = (kind, data) => {
      if (ended || response.destroyed) return;
      if (!response.write(message(kind, data)) && client.socket) client.socket.pause();
    };
    const cleanup = () => {
      if (ended) return;
      ended = true; clearTimeout(timeout);
      client.removeListener('media', consume); client.removeListener('mediaEnd', finish);
      client.removeListener('mediaFailure', fail); client.removeListener('disconnected', connectionLost);
      if (client.socket) { client.socket.removeListener('close', connectionLost); client.socket.resume(); }
      // Closing this dedicated media session cannot stop a newer stream or
      // invalidate the recorder's persistent control connection.
      client.close();
      if (!response.destroyed) response.end();
      if (this.streams.get(source.slot) === source) this.streams.delete(source.slot);
    };
    const fail = error => { send(3, error.message || 'Воспроизведение прервано'); cleanup(); };
    const finish = () => { send(4, ''); cleanup(); };
    const connectionLost = () => fail(new Error('Соединение с регистратором потеряно'));
    const consume = data => {
      clearTimeout(timeout);
      timeout = setTimeout(() => source.mode === 'playback' && firstFrame ? finish() : fail(new Error('Видеопоток прерван')), 15000);
      try { parser.push(data); } catch (error) { fail(error); }
    };
    parser.on('video', frame => {
      try {
        if (source.software) {
          if (!firstFrame) { if (!frame.key) return; firstFrame=true; send(1,{codec:frame.codec,fps:frame.fps,format:'annexb'}); }
          send(5,Buffer.concat([Buffer.from([frame.key?1:0]),frame.data]));
        } else mux.push(frame);
      } catch (error) { fail(error); }
    });
    mux.on('metadata', metadata => { firstFrame = true; send(1, metadata); });
    mux.on('segment', data => send(2, data));
    response.on('drain', () => { if (client.socket) client.socket.resume(); });
    response.on('close', cleanup);
    client.on('media', consume); client.on('mediaEnd', finish); client.on('mediaFailure', fail);
    client.on('disconnected', connectionLost);
    source.cleanup = cleanup;
    const start = async () => {
      await client.connect();
      if (ended) return client.close();
      client.socket.on('close', connectionLost);
      await client.loginWithHash(device.auth.username, device.auth.hash);
      if (ended) return client.close();
      if (source.mode === 'live') await client.startMonitor(source.channel, source.quality);
      else await client.startPlayback(source.file);
    };
    start().catch(error => { if (!ended) fail(error); });
  }

  async close() {
    await this.stop();
    for (const device of this.devices.values()) device.client.close();
    this.devices.clear();
    for (const token of this.tokens.values()) clearTimeout(token.timer);
    this.tokens.clear();
    if (this.server) await new Promise(resolve => this.server.close(resolve));
  }
}

module.exports = { ViewerManager, message };
