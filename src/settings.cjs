'use strict';
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { defaultDirectory } = require('./credentials.cjs');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const cameraIds = (values, minimum) => [...new Set((Array.isArray(values) ? values : []).filter(value => Number.isInteger(value) && value >= minimum && value < minimum + 256))];
function sanitize(input) {
  if (!input || !Array.isArray(input.profiles) || input.profiles.length > 64) throw new Error('Некорректные настройки');
  const profiles = input.profiles.map(item => {
    if (!item || !validId(item.id) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 48 || typeof item.host !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(item.host) || item.host.split('.').some(value => Number(value) > 255) || !Number.isInteger(item.port) || item.port < 1 || item.port > 65535 || !Number.isInteger(item.channelCount) || item.channelCount < 0 || item.channelCount > 256) throw new Error('Некорректный регистратор');
    return { id:item.id, title:item.title, host:item.host, port:item.port, channelCount:item.channelCount, favorites:cameraIds(item.favorites, 0) };
  });
  if (new Set(profiles.map(item => item.id)).size !== profiles.length) throw new Error('Повторяющийся регистратор');
  let workspace = null;
  if (input.workspace?.schema === 1) {
    const data = input.workspace;
    workspace = { schema:1, labels:data.labels !== false, remember:data.remember !== false, activeDevice:profiles.some(item => item.id === data.activeDevice) ? data.activeDevice : null, devices:[] };
    for (const device of Array.isArray(data.devices) ? data.devices : []) {
      if (!profiles.some(item => item.id === device?.id)) continue;
      const sets = [];
      for (const item of Array.isArray(device.sets) ? device.sets.slice(0,256) : []) {
        if (!validId(item?.id) || sets.some(set => set.id === item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 36 || ![1,2,4,6].includes(item.layout)) continue;
        const ids = cameraIds(item.cameraIds, 1);
        if (ids.length) sets.push({ id:item.id, name:item.name.trim(), layout:item.layout, cameraIds:ids });
      }
      if (sets.length) workspace.devices.push({ id:device.id, activeId:sets.some(item => item.id === device.activeId) ? device.activeId : sets[0].id, sets });
    }
  }
  return { schema:1, profiles, workspace };
}
class SettingsStore {
  constructor(directory = defaultDirectory()) { this.directory = directory; this.file = path.join(directory, 'workspace.json'); this.queue = Promise.resolve(); }
  async get() {
    await this.queue;
    try { return sanitize(JSON.parse(await fs.readFile(this.file, 'utf8'))); }
    catch (error) { if (error.code && error.code !== 'ENOENT') throw error; return null; }
  }
  set(input) {
    const snapshot = sanitize(input);
    const operation = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(this.directory, { recursive:true, mode:0o700 });
      const temporary = path.join(this.directory, 'workspace-' + crypto.randomBytes(8).toString('hex') + '.tmp');
      try { await fs.writeFile(temporary, JSON.stringify(snapshot), { mode:0o600 }); await fs.rename(temporary, this.file); }
      finally { await fs.unlink(temporary).catch(() => {}); }
      return snapshot;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
module.exports = { SettingsStore };
