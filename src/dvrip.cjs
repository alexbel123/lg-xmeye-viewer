'use strict';

const net = require('net');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const MAX_FRAME = 8 * 1024 * 1024;
const RETURN_CODES = {
  101: 'Ошибка устройства', 102: 'Версия протокола не поддерживается',
  103: 'Операция запрещена', 105: 'Требуется вход',
  106: 'Неверный логин или пароль', 107: 'Недостаточно прав',
  108: 'Время ожидания истекло', 202: 'Требуется вход',
  203: 'Неверный пароль', 204: 'Пользователь не найден',
  205: 'Устройство заблокировало вход с этого адреса',
  206: 'Доступ запрещён устройством', 207: 'Доступ запрещён устройством',
  212: 'Учётная запись уже используется', 502: 'Команда не поддерживается',
  605: 'Функция не поддерживается'
};

class DvripError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DvripError';
    if (code !== undefined) this.code = code;
  }
}

function passwordHash(password) {
  const digest = crypto.createHash('md5').update(password, 'utf8').digest();
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let index = 0; index < 16; index += 2) result += alphabet[(digest[index] + digest[index + 1]) % 62];
  return result;
}

function packet(command, sequence, session, body) {
  const data = Buffer.from(JSON.stringify(body) + '\n\0', 'utf8');
  const header = Buffer.alloc(20);
  header[0] = 0xff;
  header.writeUInt32LE(session >>> 0, 4);
  header.writeUInt32LE(sequence >>> 0, 8);
  header.writeUInt16LE(command, 14);
  header.writeUInt32LE(data.length, 16);
  return Buffer.concat([header, data]);
}

function requireSuccess(response, accepted = [100, 515]) {
  if (!accepted.includes(response.Ret)) {
    throw new DvripError(RETURN_CODES[response.Ret] || 'Устройство отклонило запрос', response.Ret);
  }
  return response;
}

function checkDeviceTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    throw new DvripError('Нужны дата и время в формате ГГГГ-ММ-ДД ЧЧ:ММ:СС');
  }
  const parts = value.match(/\d+/g).map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
      date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) {
    throw new DvripError('Некорректная дата или время');
  }
}

class DvripClient extends EventEmitter {
  constructor({ host, port = 34567, timeout = 7000 }) {
    super();
    if (net.isIP(host) !== 4) throw new DvripError('Нужен IPv4-адрес регистратора');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DvripError('Некорректный порт');
    this.host = host;
    this.port = port;
    this.timeout = timeout;
    this.socket = null;
    this.session = 0;
    this.sequence = 0;
    this.buffer = Buffer.alloc(0);
    this.pending = null;
    this.queue = Promise.resolve();
    this.keepAliveTimer = null;
    this.authenticated = false;
    this.mediaMode = null;
  }

  async connect() {
    if (this.socket) throw new DvripError('Соединение уже создано');
    this.socket = new net.Socket();
    this.socket.setNoDelay(true);
    this.socket.on('data', chunk => this._receive(chunk));
    this.socket.on('error', () => this._fail(new DvripError('Ошибка соединения с устройством')));
    this.socket.on('close', () => {
      this.authenticated = false;
      clearInterval(this.keepAliveTimer);
      this._fail(new DvripError('Устройство закрыло соединение'));
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup(); this.close(); reject(new DvripError('Устройство не отвечает'));
      }, this.timeout);
      const onError = () => { cleanup(); this.close(); reject(new DvripError('Не удалось подключиться к устройству')); };
      const onClose = () => { cleanup(); reject(new DvripError('Подключение отменено')); };
      const cleanup = () => { clearTimeout(timer); this.socket.removeListener('error', onError); this.socket.removeListener('close', onClose); };
      this.socket.once('error', onError);
      this.socket.once('close', onClose);
      this.socket.connect(this.port, this.host, () => { cleanup(); resolve(); });
    });
  }

  _fail(error) {
    const pending = this.pending;
    if (pending) {
      this.pending = null;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  _receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 20) {
      if (this.buffer[0] !== 0xff) {
        this._fail(new DvripError('Устройство вернуло неизвестный протокол'));
        return this.close();
      }
      const size = this.buffer.readUInt32LE(16);
      if (size > MAX_FRAME) {
        this._fail(new DvripError('Ответ устройства превышает допустимый размер'));
        return this.close();
      }
      if (this.buffer.length < 20 + size) return;
      const frame = this.buffer.subarray(0, 20 + size);
      this.buffer = this.buffer.subarray(20 + size);
      const command = frame.readUInt16LE(14);
      // Alarms and other unsolicited messages must not consume a pending reply.
      const pending = this.pending;
      if (!pending || command !== pending.command + 1) {
        const payload = frame.subarray(20);
        if (this.mediaMode && [1412, 1422].includes(command) && payload.length === 0) this.emit('mediaEnd');
        else if (this.mediaMode && [1412, 1422].includes(command)) this.emit('media', payload);
        else if (this.mediaMode && payload[0] === 0) this.emit('media', payload);
        else if (this.mediaMode && [1411, 1421].includes(command) && payload[0] === 123) {
          try {
            const notice = JSON.parse(payload.toString('utf8').replace(/[\x00\r\n]+$/, ''));
            if (![100, 515].includes(notice.Ret)) this.emit('mediaFailure', new DvripError(RETURN_CODES[notice.Ret] || 'Устройство остановило видео', notice.Ret));
          } catch (_) {}
        }
        continue;
      }
      let response;
      try { response = JSON.parse(frame.subarray(20).toString('utf8').replace(/[\x00\r\n]+$/, '')); }
      catch (_) {
        this._fail(new DvripError('Устройство вернуло некорректный ответ'));
        return this.close();
      }
      if (!response || typeof response !== 'object' || Array.isArray(response)) {
        this._fail(new DvripError('Устройство вернуло некорректный ответ'));
        return this.close();
      }
      this.pending = null;
      clearTimeout(pending.timer);
      pending.resolve(response);
    }
  }

  request(command, body) {
    const perform = () => new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed || !this.socket.writable) return reject(new DvripError('Нет соединения'));
      const timer = setTimeout(() => {
        this._fail(new DvripError('Нет ответа от устройства'));
        this.close();
      }, this.timeout);
      this.pending = { command, timer, resolve, reject };
      const data = { ...body };
      if (this.session) data.SessionID = '0x' + this.session.toString(16).padStart(8, '0');
      this.socket.write(packet(command, this.sequence++, this.session, data), error => {
        if (error) { this._fail(new DvripError('Не удалось отправить запрос')); this.close(); }
      });
    });
    const task = this.queue.then(perform);
    this.queue = task.catch(() => {});
    return task;
  }

  async login(username, password) {
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string') {
      throw new DvripError('Нужны логин и пароль устройства');
    }
    return this.loginWithHash(username, passwordHash(password));
  }

  async loginWithHash(username, hash) {
    if (typeof username !== 'string' || !username.trim() || typeof hash !== 'string' || !/^[A-Za-z0-9]{8}$/.test(hash)) throw new DvripError('Некорректные сохранённые данные входа');
    // One attempt only. Wrong credentials must never trigger automatic retries.
    let response;
    try {
      response = requireSuccess(await this.request(1000, {
        EncryptType: 'MD5', LoginType: 'DVRIP-Web',
        PassWord: hash, UserName: username.trim()
      }));
      const session = Number.parseInt(response.SessionID, 16);
      if (!Number.isInteger(session) || session < 1 || session > 0xffffffff) throw new DvripError('Устройство не выдало сеанс входа');
      this.session = session;
      this.authenticated = true;
      const seconds = Number(response.AliveInterval);
      const interval = Number.isFinite(seconds) && seconds > 0 ? Math.max(1, seconds * 0.7) : 15;
      this.keepAliveTimer = setInterval(() => {
        this.request(1006, { Name: 'KeepAlive' }).then(requireSuccess).catch(() => {
          this.close(); this.emit('disconnected', { reason: 'Сеанс устройства завершён' });
        });
      }, interval * 1000);
      if (this.keepAliveTimer.unref) this.keepAliveTimer.unref();
      return { deviceType: response.DeviceType || response['DeviceType '] || null };
    } catch (error) { this.close(); throw error; }
  }

  async getInfo(name, command = 1042) {
    if (!this.authenticated) throw new DvripError('Сначала войдите в устройство');
    const response = requireSuccess(await this.request(command, { Name: name }));
    if (!(name in response)) throw new DvripError('Устройство не вернуло запрошенные сведения');
    return response[name];
  }

  systemInfo() { return this.getInfo('SystemInfo', 1020); }
  deviceTime() { return this.getInfo('OPTimeQuery', 1452); }
  channelTitles() { return this.getInfo('ChannelTitle', 1048); }

  writeCommand(command, body) {
    if (!this.authenticated || !this.socket || this.socket.destroyed) throw new DvripError('Нет соединения');
    this.socket.write(packet(command, this.sequence++, this.session, {
      ...body, SessionID: '0x' + this.session.toString(16).padStart(8, '0')
    }));
  }

  async startMonitor(channel, stream = 'Extra1') {
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) throw new DvripError('Некорректный канал');
    if (!['Main', 'Extra1'].includes(stream)) throw new DvripError('Неизвестный видеопоток');
    const parameter = { Channel: channel, CombinMode: 'NONE', StreamType: stream, TransMode: 'TCP' };
    requireSuccess(await this.request(1413, { Name: 'OPMonitor', OPMonitor: { Action: 'Claim', Parameter: parameter } }));
    this.mediaMode = { name: 'OPMonitor', command: 1410, parameter };
    this.writeCommand(1410, { Name: 'OPMonitor', OPMonitor: { Action: 'Start', Parameter: parameter } });
  }

  async startPlayback(file) {
    if (!file || typeof file.FileName !== 'string' || file.FileName.length > 2048) throw new DvripError('Некорректная запись');
    checkDeviceTime(file.BeginTime); checkDeviceTime(file.EndTime);
    const parameter = { PlayMode: 'ByName', FileName: file.FileName, StreamType: 0, Value: 0, TransMode: 'TCP' };
    const details = { Parameter: parameter, StartTime: file.BeginTime, EndTime: file.EndTime };
    requireSuccess(await this.request(1424, { Name: 'OPPlayBack', OPPlayBack: { ...details, Action: 'Claim' } }));
    this.mediaMode = { name: 'OPPlayBack', command: 1420, parameter, details };
    this.writeCommand(1420, { Name: 'OPPlayBack', OPPlayBack: { ...details, Action: 'Start' } });
  }

  stopMedia() {
    const mode = this.mediaMode;
    this.mediaMode = null;
    if (mode && this.authenticated && this.socket && !this.socket.destroyed) {
      this.writeCommand(mode.command, {
        Name: mode.name,
        [mode.name]: { ...mode.details, Parameter: mode.parameter, Action: 'Stop' }
      });
    }
  }

  async searchArchive({ channel, begin, end, maxPages = 16 }) {
    if (!this.authenticated) throw new DvripError('Сначала войдите в устройство');
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) throw new DvripError('Некорректный канал');
    checkDeviceTime(begin); checkDeviceTime(end);
    if (begin > end) throw new DvripError('Начало периода позже окончания');
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 64) throw new DvripError('Некорректный предел поиска');
    const files = [], seen = new Set();
    let cursor = begin;
    for (let page = 0; page < maxPages; page++) {
      const response = await this.request(1440, {
        Name: 'OPFileQuery', OPFileQuery: {
          BeginTime: cursor, EndTime: end, Channel: channel,
          DriverTypeMask: '0x0000FFFF', Event: '*', StreamType: '0x00000000', Type: 'h264'
        }
      });
      if ([109, 119].includes(response.Ret)) return { files, truncated: false };
      requireSuccess(response, [100, 110, 111]);
      const items = response.OPFileQuery;
      if (!Array.isArray(items)) throw new DvripError('Устройство вернуло неизвестный формат списка записей');
      const sorted = [...items].sort((a, b) => String(a.BeginTime || '').localeCompare(String(b.BeginTime || '')));
      let added = 0;
      for (const item of sorted) {
        if (!item || typeof item !== 'object') throw new DvripError('Некорректная запись архива');
        const key = JSON.stringify([item.FileName, item.BeginTime, item.EndTime]);
        if (!seen.has(key)) { seen.add(key); files.push(item); added++; }
      }
      if (response.Ret === 110 || !items.length || (response.Ret !== 111 && items.length < 64)) return { files, truncated: false };
      const next = sorted[sorted.length - 1].BeginTime;
      if (!added || typeof next !== 'string' || next <= cursor) return { files, truncated: true, nextBegin: cursor };
      cursor = next;
    }
    return { files, truncated: true, nextBegin: cursor };
  }

  close() {
    this.mediaMode = null;
    clearInterval(this.keepAliveTimer);
    this.authenticated = false;
    this._fail(new DvripError('Соединение закрыто'));
    if (this.socket) this.socket.destroy();
  }
}

module.exports = { DvripClient, DvripError, passwordHash };
