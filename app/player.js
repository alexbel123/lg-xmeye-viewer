'use strict';
(function () {
  class LocalVideoPlayer {
    constructor(video, callbacks) {
      this.video = video; this.callbacks = callbacks; this.controller = null;
      this.queue = []; this.source = null; this.sourceBuffer = null; this.url = null;
      this.ended = false; this.generation = 0;
      video.addEventListener('playing', () => { if (this.controller) this.callbacks.state('playing'); });
      video.addEventListener('ended', () => { if (this.controller) this.callbacks.state('ended'); });
      video.addEventListener('error', () => {
        if (this.controller) this._fail(new Error('Телевизор не смог декодировать видео. Попробуйте дополнительный поток'));
      });
    }
    async start(url) {
      this.stop();
      const generation = ++this.generation;
      this.controller = new AbortController();
      this.callbacks.state('loading');
      try {
        const response = await fetch(url, { signal: this.controller.signal, cache: 'no-store' });
        if (!response.ok || !response.body) throw new Error('Не удалось открыть видео. Откройте канал повторно');
        const reader = response.body.getReader();
        let buffer = new Uint8Array(0), receivedEnd = false;
        for (;;) {
          const result = await reader.read();
          if (generation !== this.generation) return;
          if (result.done) break;
          const joined = new Uint8Array(buffer.length + result.value.length);
          joined.set(buffer); joined.set(result.value, buffer.length); buffer = joined;
          while (buffer.length >= 5) {
            const size = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(1);
            if (size > 16 * 1024 * 1024) throw new Error('Получен слишком большой видеокадр');
            if (buffer.length < size + 5) break;
            const kind = buffer[0], data = buffer.slice(5, size + 5);
            buffer = buffer.slice(size + 5);
            if (kind === 1) await this._open(JSON.parse(new TextDecoder().decode(data)), generation);
            else if (kind === 2) { this.queue.push(data); this._pump(); }
            else if (kind === 3) throw new Error(new TextDecoder().decode(data));
            else if (kind === 4) { this.ended = true; receivedEnd = true; this._pump(); }
          }
          if (buffer.length > 16 * 1024 * 1024) throw new Error('Неизвестный формат видео');
          // Limit browser-side buffering for long recording segments.
          while (generation === this.generation && (this.queue.length > 80 || this._ahead() > 24)) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        }
        if (!receivedEnd && generation === this.generation) throw new Error('Видеопоток прерван');
      } catch (error) {
        if (generation === this.generation && error.name !== 'AbortError') this._fail(error);
      }
    }
    _ahead() {
      try { return this.video.buffered.length ? this.video.buffered.end(this.video.buffered.length - 1) - this.video.currentTime : 0; }
      catch (_) { return 0; }
    }
    async _open(metadata, generation) {
      if (!window.MediaSource || !MediaSource.isTypeSupported(metadata.mime)) {
        throw new Error(metadata.codec === 'h265' ? 'H.265 недоступен в плеере этого телевизора. Выберите поток H.264' : 'Этот формат H.264 недоступен в плеере телевизора');
      }
      this.callbacks.metadata(metadata);
      this.source = new MediaSource();
      this.url = URL.createObjectURL(this.source); this.video.src = this.url;
      await new Promise((resolve, reject) => {
        const signal = this.controller.signal;
        const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        this.source.addEventListener('sourceopen', () => {
          signal.removeEventListener('abort', abort);
          if (generation !== this.generation) return reject(new DOMException('Cancelled', 'AbortError'));
          try {
            this.sourceBuffer = this.source.addSourceBuffer(metadata.mime);
            this.sourceBuffer.addEventListener('updateend', () => { if (generation === this.generation) this._pump(); });
            this.sourceBuffer.addEventListener('error', () => { if (generation === this.generation) this._fail(new Error('Ошибка декодирования видео')); });
            resolve();
          } catch (_) { reject(new Error('Не удалось запустить видеодекодер')); }
        }, { once: true });
      });
      this.video.play().catch(() => { if (generation === this.generation && this.controller) this._fail(new Error('Нажмите на канал ещё раз для запуска видео')); });
    }
    _pump() {
      if (!this.sourceBuffer || this.sourceBuffer.updating || this.source?.readyState !== 'open') return;
      try {
        if (this.video.currentTime > 20 && this.sourceBuffer.buffered.length && this.sourceBuffer.buffered.start(0) < this.video.currentTime - 16) {
          this.sourceBuffer.remove(0, this.video.currentTime - 12); return;
        }
        if (this.queue.length) { this.sourceBuffer.appendBuffer(this.queue.shift()); return; }
        if (this.ended) this.source.endOfStream();
      } catch (_) { this._fail(new Error('Буфер плеера недоступен. Откройте канал повторно')); }
    }
    _fail(error) { this.stop(); this.callbacks.error(error.message || 'Не удалось воспроизвести видео'); }
    stop() {
      ++this.generation;
      if (this.controller) this.controller.abort();
      this.controller = null; this.queue = []; this.ended = false;
      this.video.pause(); this.video.removeAttribute('src'); this.video.load();
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = null; this.sourceBuffer = null; this.source = null;
    }
  }
  window.LocalVideoPlayer = LocalVideoPlayer;
})();
