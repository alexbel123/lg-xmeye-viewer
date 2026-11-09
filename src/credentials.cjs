'use strict';
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { passwordHash } = require('./dvrip.cjs');
const CONTEXT = Buffer.from('local.xmeye.viewer.credentials.v1');

function defaultDirectory() {
  return process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'LGXMEyeViewer')
    : '/media/internal/local.xmeye.viewer';
}

function dpapi(data, protect) {
  const operation = protect ? 'Protect' : 'Unprotect';
  const script = 'Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); ' +
    '$result=[System.Security.Cryptography.ProtectedData]::' + operation + '($data,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); ' +
    '[Console]::Out.Write([Convert]::ToBase64String($result))';
  return new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 65536, encoding: 'utf8' }, (error, output) => {
        if (error) return reject(new Error('Не удалось открыть защищённое хранилище Windows'));
        resolve(Buffer.from(output.trim(), 'base64'));
      });
    child.stdin.on('error', () => {});
    child.stdin.end(data.toString('base64'));
  });
}

function validateId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Некорректное устройство');
}

class CredentialStore {
  constructor(directory = defaultDirectory()) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'credentials.enc');
    this.keyFile = path.join(this.directory, 'credentials.key');
    this.accounts = new Map(); this.loaded = false; this.key = null; this.queue = Promise.resolve();
  }

  _serial(operation) {
    const task = this.queue.then(async () => { await this._load(); return operation(); });
    this.queue = task.catch(() => {});
    return task;
  }

  async _getKey(create) {
    if (this.key) return this.key;
    let content;
    try { content = await fs.readFile(this.keyFile); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) throw new Error('Ключ сохранённых паролей недоступен');
      const key = crypto.randomBytes(32);
      const wrapped = process.platform === 'win32'
        ? Buffer.concat([Buffer.from('DPAPI1\n'), await dpapi(key, true)])
        : Buffer.concat([Buffer.from('KEY1\n'), key]);
      try { await fs.writeFile(this.keyFile, wrapped, { mode: 0o600, flag: 'wx' }); }
      catch (writeError) { if (writeError.code !== 'EEXIST') throw new Error('Не удалось сохранить ключ паролей'); return this._getKey(false); }
      this.key = key; return key;
    }
    let key;
    if (content.subarray(0, 7).toString() === 'DPAPI1\n' && process.platform === 'win32') key = await dpapi(content.subarray(7), false);
    else if (content.subarray(0, 5).toString() === 'KEY1\n' && process.platform !== 'win32') key = content.subarray(5);
    else throw new Error('Неизвестный формат ключа паролей');
    if (key.length !== 32) throw new Error('Ключ сохранённых паролей повреждён');
    this.key = key; return key;
  }

  async _load() {
    if (this.loaded) return;
    let content;
    try {
      const stat = await fs.stat(this.file);
      if (stat.size > 1024 * 1024) throw new Error('Недопустимый размер хранилища');
      content = await fs.readFile(this.file, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') { this.loaded = true; return; }
      throw new Error('Не удалось прочитать сохранённые данные входа');
    }
    try {
      const envelope = JSON.parse(content);
      if (envelope.version !== 1) throw new Error('Unknown version');
      const iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64');
      if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid envelope');
      const cipher = crypto.createDecipheriv('aes-256-gcm', await this._getKey(false), iv);
      cipher.setAAD(CONTEXT); cipher.setAuthTag(tag);
      const decoded = JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.data, 'base64')), cipher.final()]).toString('utf8'));
      if (!Array.isArray(decoded.accounts) || decoded.accounts.length > 512) throw new Error('Invalid accounts');
      const accounts = new Map();
      for (const account of decoded.accounts) {
        validateId(account.id);
        if (typeof account.username !== 'string' || !account.username || !/^[A-Za-z0-9]{8}$/.test(account.hash)) throw new Error('Invalid account');
        accounts.set(account.id, { id: account.id, username: account.username, hash: account.hash });
      }
      this.accounts = accounts; this.loaded = true;
    } catch (_) { throw new Error('Сохранённые данные входа не удалось расшифровать. Файл не изменён'); }
  }

  async _persist(accounts) {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const key = await this._getKey(true), iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(CONTEXT);
    const data = Buffer.concat([cipher.update(JSON.stringify({ accounts: [...accounts.values()] }), 'utf8'), cipher.final()]);
    const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
    const temporary = path.join(this.directory, 'credentials-' + crypto.randomBytes(8).toString('hex') + '.tmp');
    try {
      await fs.writeFile(temporary, envelope, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, this.file);
      this.accounts = accounts;
    } catch (_) {
      await fs.unlink(temporary).catch(() => {});
      throw new Error('Не удалось сохранить данные входа');
    }
  }

  list() { return this._serial(() => [...this.accounts.values()].map(({ id, username }) => ({ id, username, saved: true }))); }
  get(id) { validateId(id); return this._serial(() => { const account = this.accounts.get(id); return account ? { ...account } : null; }); }
  set({ id, username, password, keepPassword = false }) {
    validateId(id);
    if (typeof username !== 'string' || !username.trim() || username.length > 64) throw new Error('Укажите пользователя регистратора');
    if (password !== undefined && (typeof password !== 'string' || password.length > 128)) throw new Error('Некорректный пароль');
    return this._serial(async () => {
      const previous = this.accounts.get(id);
      const hash = typeof password === 'string' ? passwordHash(password) : keepPassword && previous ? previous.hash : null;
      if (!hash) throw new Error('Введите пароль регистратора');
      const next = new Map(this.accounts);
      next.set(id, { id, username: username.trim(), hash });
      await this._persist(next);
      return { id, username: username.trim(), saved: true };
    });
  }
  delete(id) {
    validateId(id);
    return this._serial(async () => {
      if (!this.accounts.has(id)) return { id, saved: false };
      const next = new Map(this.accounts); next.delete(id); await this._persist(next);
      return { id, saved: false };
    });
  }
}

module.exports = { CredentialStore, defaultDirectory };
