'use strict';
const { EventEmitter } = require('events');

class MediaParser extends EventEmitter {
  constructor() { super(); this.buffer = Buffer.alloc(0); this.codec = null; this.fps = 25; }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > 16 * 1024 * 1024) throw new Error('Видеопоток превышает допустимый размер кадра');
    while (this.buffer.length >= 8) {
      if (this.buffer[0] !== 0 || this.buffer[1] !== 0 || this.buffer[2] !== 1) throw new Error('Неизвестный формат видеопотока');
      const type = this.buffer[3];
      const header = [0xfc, 0xfe].includes(type) ? 16 : 8;
      if (this.buffer.length < header) return;
      let size;
      if (header === 16) size = this.buffer.readUInt32LE(12);
      else if (type === 0xfd) size = this.buffer.readUInt32LE(4);
      else if ([0xfa, 0xf9].includes(type)) size = this.buffer.readUInt16LE(6);
      else throw new Error('Неизвестный тип кадра');
      if (size > 8 * 1024 * 1024) throw new Error('Слишком большой видеокадр');
      if (this.buffer.length < size + header) return;
      const frame = this.buffer.subarray(0, size + header);
      this.buffer = this.buffer.subarray(size + header);
      if (type === 0xfc) {
        const code = frame[4] & 15;
        this.codec = code === 2 ? 'h264' : code === 3 ? 'h265' : null;
        if (!this.codec) throw new Error('Кодек потока не поддерживается. Выберите H.264 или H.265');
        this.fps = frame[5] > 0 && frame[5] <= 120 ? frame[5] : 25;
      }
      if ([0xfc, 0xfd].includes(type) && this.codec) {
        this.emit('video', { codec: this.codec, fps: this.fps, key: type === 0xfc, data: frame.subarray(header) });
      }
    }
  }
}

function splitNALs(buffer) {
  const starts = [];
  for (let i = 0; i < buffer.length - 2; i++) {
    if (buffer[i] === 0 && buffer[i + 1] === 0) {
      if (buffer[i + 2] === 1) { starts.push({ at: i, data: i + 3 }); i += 2; }
      else if (buffer[i + 2] === 0 && buffer[i + 3] === 1) { starts.push({ at: i, data: i + 4 }); i += 3; }
    }
  }
  return starts.map((start, i) => buffer.subarray(start.data, i + 1 < starts.length ? starts[i + 1].at : buffer.length)).filter(x => x.length);
}

class Bits {
  constructor(data) { this.data = data; this.position = 0; }
  read(count) {
    if (count < 0 || this.position + count > this.data.length * 8) throw new Error('Повреждён заголовок видео');
    let value = 0;
    while (count--) { value = value * 2 + ((this.data[this.position >> 3] >> (7 - (this.position & 7))) & 1); this.position++; }
    return value;
  }
  skip(count) { this.read(count); }
  ue() {
    let zeroes = 0;
    while (this.read(1) === 0) { if (++zeroes > 31) throw new Error('Повреждён заголовок видео'); }
    return 2 ** zeroes - 1 + this.read(zeroes);
  }
  se() { const value = this.ue(); return value % 2 ? (value + 1) / 2 : -value / 2; }
}

function rbsp(data) {
  const bytes = [];
  for (let i = 0; i < data.length; i++) {
    if (i > 1 && data[i] === 3 && data[i - 1] === 0 && data[i - 2] === 0) continue;
    bytes.push(data[i]);
  }
  return Buffer.from(bytes);
}

function h264Info(sps) {
  const bits = new Bits(rbsp(sps.subarray(1)));
  const profile = bits.read(8); bits.skip(16); bits.ue();
  let chroma = 1;
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
    chroma = bits.ue();
    if (chroma === 3) bits.skip(1);
    bits.ue(); bits.ue(); bits.skip(1);
    if (bits.read(1)) {
      for (let i = 0; i < (chroma === 3 ? 12 : 8); i++) if (bits.read(1)) {
        let last = 8, next = 8;
        for (let j = 0; j < (i < 6 ? 16 : 64); j++) {
          if (next !== 0) next = (last + bits.se() + 256) % 256;
          last = next || last;
        }
      }
    }
  }
  bits.ue();
  const order = bits.ue();
  if (order === 0) bits.ue();
  else if (order === 1) { bits.skip(1); bits.se(); bits.se(); const count = bits.ue(); for (let i = 0; i < count; i++) bits.se(); }
  bits.ue(); bits.skip(1);
  const width = (bits.ue() + 1) * 16;
  const heightUnits = bits.ue() + 1;
  const progressive = bits.read(1);
  if (!progressive) bits.skip(1);
  bits.skip(1);
  let left = 0, right = 0, top = 0, bottom = 0;
  if (bits.read(1)) { left = bits.ue(); right = bits.ue(); top = bits.ue(); bottom = bits.ue(); }
  const unitX = chroma === 1 || chroma === 2 ? 2 : 1;
  const unitY = (chroma === 1 ? 2 : 1) * (2 - progressive);
  return { width: width - (left + right) * unitX, height: heightUnits * 16 * (2 - progressive) - (top + bottom) * unitY };
}

function h265Info(sps) {
  const data = rbsp(sps.subarray(2)), bits = new Bits(data);
  bits.skip(4);
  const layers = bits.read(3), nested = bits.read(1);
  const profile = bits.read(8), compatible = bits.read(32);
  const constraints = Buffer.alloc(6); for (let i = 0; i < 6; i++) constraints[i] = bits.read(8);
  const level = bits.read(8), flags = [];
  for (let i = 0; i < layers; i++) flags.push([bits.read(1), bits.read(1)]);
  if (layers) bits.skip((8 - layers) * 2);
  for (const [p, l] of flags) { if (p) bits.skip(88); if (l) bits.skip(8); }
  bits.ue();
  const chroma = bits.ue(); if (chroma === 3) bits.skip(1);
  let width = bits.ue(), height = bits.ue();
  if (bits.read(1)) {
    const x = chroma === 1 || chroma === 2 ? 2 : 1, y = chroma === 1 ? 2 : 1;
    width -= (bits.ue() + bits.ue()) * x; height -= (bits.ue() + bits.ue()) * y;
  }
  const depthLuma = bits.ue(), depthChroma = bits.ue();
  return { width, height, profile, compatible, constraints, level, layers: layers + 1, nested, chroma, depthLuma, depthChroma };
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; }
function box(type, ...content) { const body = Buffer.concat(content); return Buffer.concat([u32(body.length + 8), Buffer.from(type), body]); }
function full(type, version, flags, ...data) { return box(type, Buffer.from([version, flags >> 16 & 255, flags >> 8 & 255, flags & 255]), ...data); }
const matrix = Buffer.from('000100000000000000000000000000000001000000000000000000000000000040000000', 'hex');

function initialization(codec, parameters, info) {
  const mvhd = full('mvhd', 0, 0, Buffer.alloc(8), u32(90000), u32(0), u32(0x10000), u16(0x100), Buffer.alloc(10), matrix, Buffer.alloc(24), u32(2));
  const tkhd = full('tkhd', 0, 7, Buffer.alloc(8), u32(1), Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8), matrix, u32(info.width * 65536), u32(info.height * 65536));
  const mdhd = full('mdhd', 0, 0, Buffer.alloc(8), u32(90000), u32(0), u16(0x55c4), u16(0));
  const hdlr = full('hdlr', 0, 0, u32(0), Buffer.from('vide'), Buffer.alloc(12), Buffer.from('Video\0'));
  let config;
  if (codec === 'h264') {
    const { sps, pps } = parameters;
    config = box('avcC', Buffer.from([1, sps[1], sps[2], sps[3], 255, 225]), u16(sps.length), sps, Buffer.from([1]), u16(pps.length), pps);
  } else {
    const fixed = Buffer.alloc(23);
    fixed[0] = 1; fixed[1] = info.profile; fixed.writeUInt32BE(info.compatible >>> 0, 2);
    info.constraints.copy(fixed, 6); fixed[12] = info.level; fixed.writeUInt16BE(0xf000, 13);
    fixed[15] = 0xfc; fixed[16] = 0xfc | info.chroma; fixed[17] = 0xf8 | info.depthLuma; fixed[18] = 0xf8 | info.depthChroma;
    fixed[21] = (info.layers << 3) | (info.nested << 2) | 3; fixed[22] = 3;
    const arrays = [parameters.vps, parameters.sps, parameters.pps].map((nal, i) => Buffer.concat([Buffer.from([0x80 | (32 + i)]), u16(1), u16(nal.length), nal]));
    config = box('hvcC', fixed, ...arrays);
  }
  const visual = Buffer.alloc(78);
  visual.writeUInt16BE(1, 6); visual.writeUInt16BE(info.width, 24); visual.writeUInt16BE(info.height, 26);
  visual.writeUInt32BE(0x00480000, 28); visual.writeUInt32BE(0x00480000, 32); visual.writeUInt16BE(1, 40);
  visual.writeUInt16BE(24, 74); visual.writeUInt16BE(0xffff, 76);
  const entry = box(codec === 'h264' ? 'avc1' : 'hvc1', visual, config);
  const stbl = box('stbl', full('stsd', 0, 0, u32(1), entry), full('stts', 0, 0, u32(0)), full('stsc', 0, 0, u32(0)), full('stsz', 0, 0, u32(0), u32(0)), full('stco', 0, 0, u32(0)));
  const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
  const minf = box('minf', full('vmhd', 0, 1, Buffer.alloc(8)), dinf, stbl);
  return Buffer.concat([
    box('ftyp', Buffer.from('iso6'), u32(1), Buffer.from('iso6isommp41')),
    box('moov', mvhd, box('trak', tkhd, box('mdia', mdhd, hdlr, minf)), box('mvex', full('trex', 0, 0, u32(1), u32(1), u32(0), u32(0), u32(0))))
  ]);
}

class FragmentedMP4 extends EventEmitter {
  constructor() { super(); this.parameters = {}; this.started = false; this.sequence = 1; this.time = 0; this.codec = null; }
  push(frame) {
    const nals = splitNALs(frame.data);
    if (!nals.length) return;
    if (this.codec && frame.codec !== this.codec) throw new Error('Кодек изменился. Откройте канал повторно');
    for (const nal of nals) {
      const type = frame.codec === 'h264' ? nal[0] & 31 : (nal[0] >> 1) & 63;
      const key = frame.codec === 'h264' ? ({ 7: 'sps', 8: 'pps' })[type] : ({ 32: 'vps', 33: 'sps', 34: 'pps' })[type];
      if (key) {
        if (this.started && this.parameters[key] && !this.parameters[key].equals(nal)) throw new Error('Параметры видео изменились. Откройте канал повторно');
        this.parameters[key] = nal;
      }
    }
    const vcl = nals.filter(nal => frame.codec === 'h264' ? [1, 5].includes(nal[0] & 31) : ((nal[0] >> 1) & 63) <= 31);
    if (!vcl.length) return;
    // No presentation timestamps are supplied by this DVRIP stream variant.
    // Reject reordered pictures rather than silently assigning incorrect PTS.
    let bPicture = false;
    if (frame.codec === 'h264') {
      const slice = new Bits(rbsp(vcl[0].subarray(1)));
      slice.ue(); bPicture = slice.ue() % 5 === 1;
    } else if (this.parameters.pps) {
      const ppsBits = new Bits(rbsp(this.parameters.pps.subarray(2)));
      ppsBits.ue(); ppsBits.ue(); ppsBits.skip(2);
      const extraBits = ppsBits.read(3), slice = new Bits(rbsp(vcl[0].subarray(2)));
      const first = slice.read(1), type = (vcl[0][0] >> 1) & 63;
      if (type >= 16 && type <= 23) slice.skip(1);
      slice.ue();
      if (first) { slice.skip(extraBits); bPicture = slice.ue() === 0; }
    }
    if (bPicture) throw new Error('Потоки с B-кадрами пока не поддерживаются');
    if (!this.started) {
      const { sps, pps, vps } = this.parameters;
      if (!frame.key || !sps || !pps || (frame.codec === 'h265' && !vps)) return;
      this.codec = frame.codec;
      const info = frame.codec === 'h264' ? h264Info(sps) : h265Info(sps);
      let codecString;
      if (frame.codec === 'h264') codecString = 'avc1.' + sps.subarray(1, 4).toString('hex');
      else {
        let compatibility = 0;
        for (let i = 0; i < 32; i++) compatibility = (compatibility * 2 + ((info.compatible >>> i) & 1)) >>> 0;
        const constraints = [...info.constraints]; while (constraints.length && constraints[constraints.length - 1] === 0) constraints.pop();
        codecString = 'hvc1.' + (info.profile & 31) + '.' + compatibility.toString(16).toUpperCase() + '.' + (info.profile & 32 ? 'H' : 'L') + info.level + (constraints.length ? '.' + constraints.map(x => x.toString(16).toUpperCase()).join('.') : '');
      }
      this.started = true;
      this.emit('metadata', { codec: this.codec, mime: 'video/mp4; codecs="' + codecString + '"', width: info.width, height: info.height, fps: frame.fps });
      this.emit('segment', initialization(this.codec, this.parameters, info));
    }
    const payload = Buffer.concat(vcl.map(nal => Buffer.concat([u32(nal.length), nal])));
    const duration = Math.round(90000 / frame.fps);
    const timing = Buffer.alloc(8); timing.writeUInt32BE(Math.floor(this.time / 0x100000000), 0); timing.writeUInt32BE(this.time >>> 0, 4);
    const makeMoof = offset => box('moof', full('mfhd', 0, 0, u32(this.sequence)), box('traf', full('tfhd', 0, 0x020000, u32(1)), full('tfdt', 1, 0, timing), full('trun', 0, 0x000701, u32(1), u32(offset), u32(duration), u32(payload.length), u32(frame.key ? 0x02000000 : 0x01010000))));
    const moof = makeMoof(0);
    this.emit('segment', Buffer.concat([makeMoof(moof.length + 8), box('mdat', payload)]));
    this.time += duration; this.sequence++;
  }
}

module.exports = { MediaParser, FragmentedMP4, splitNALs, h264Info, h265Info };
