'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const cameraIcon = '<svg class="device-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h5m-5 4h8"/></svg>';
  const starIcon = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg>';
  const defaults = [];
  let profiles;
  try {
    const saved = JSON.parse(localStorage.getItem('viewer.profiles'));
    profiles = Array.isArray(saved) && saved.every(x => x && typeof x.id === 'string' && typeof x.host === 'string' && typeof x.title === 'string') ? saved : defaults;
  } catch (_) { profiles = defaults; }
  const state = { profiles, selected: profiles[0]?.id || null, connections: new Map(), view: 'live', channel: 0, quality: 'Extra1', favorites: false, connecting: null, editing: null, modal: null, lastFocus: null, playing: false, mode: 'live', playGeneration: 0, loginGeneration: 0, lastPlay: null, recordings: [], nextBegin: null, lastQuery: null, native: Boolean(window.PalmServiceBridge), service: false, keyboardVisible: false };
  state.savedCredentials = new Map(); state.forgetCredentials = false;
  state.multi = false; state.tiles = new Map(); state.mainLease = null; state.maxStreams = 6;
  const bridges = new Set();
  let sessionBridge = null, toastTimer;
  function service(method, parameters = {}) {
    if (!state.native) return fetch('/api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Viewer-Client': '1' }, body: JSON.stringify(parameters) }).then(async response => {
      const result = await response.json(); if (!response.ok || result.returnValue === false) throw new Error(result.errorText || 'Не удалось выполнить запрос'); return result;
    });
    return new Promise((resolve, reject) => {
      const bridge = new PalmServiceBridge(); bridges.add(bridge);
      const timer = setTimeout(() => { bridges.delete(bridge); if (bridge.cancel) bridge.cancel(); reject(new Error('Сервис телевизора не ответил. Переоткройте приложение')); }, 40000);
      bridge.onservicecallback = raw => {
        clearTimeout(timer); bridges.delete(bridge);
        try { const result = JSON.parse(raw); if (!result.returnValue) reject(new Error(result.errorText || 'Ошибка сервиса LG')); else resolve(result); }
        catch (_) { reject(new Error('Не удалось прочитать ответ сервиса LG')); }
      };
      bridge.call('luna://local.xmeye.viewer.service/' + method, JSON.stringify(parameters));
    });
  }
  const profile = () => state.profiles.find(item => item.id === state.selected);
  const connection = () => state.connections.get(state.selected);
  function persist() {
    try { localStorage.setItem('viewer.profiles', JSON.stringify(state.profiles.map(({ id, title, host, port, channelCount, favorites }) => ({ id, title, host, port, channelCount, favorites })))); }
    catch (_) { toast('Не удалось сохранить настройки'); }
  }
  function showError(id, text) { $(id).textContent = text || ''; $(id).hidden = !text; }
  function toast(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000); }
  function makeButton(className, action, label) { const button = document.createElement('button'); button.type = 'button'; button.className = className; button.dataset.action = action; if (label) button.textContent = label; return button; }
  function renderDevices() {
    $('device-count').textContent = String(state.profiles.length); $('device-list').replaceChildren();
    for (const item of state.profiles) {
      const button = makeButton('device-button' + (item.id === state.selected ? ' selected' : ''), 'select-device');
      button.dataset.id = item.id; button.setAttribute('aria-current', item.id === state.selected ? 'true' : 'false');
      button.innerHTML = cameraIcon;
      const description = document.createElement('span'), name = document.createElement('span'), ip = document.createElement('span'), dot = document.createElement('span');
      name.className = 'device-name'; name.textContent = item.title; ip.className = 'device-ip'; ip.textContent = item.host;
      dot.className = 'status-dot' + (state.connections.has(item.id) ? ' connected' : '');
      description.append(name, ip); button.append(description, dot); $('device-list').append(button);
    }
  }
  function renderChannels() {
    const current = connection(), item = profile(); $('channels').replaceChildren();
    $('channel-count').textContent = current ? String(current.channels.length) : '';
    if (state.connecting === state.selected) {
      for (let i = 0; i < 4; i++) { const row = document.createElement('div'); row.className = 'skeleton-row'; row.setAttribute('aria-hidden', 'true'); $('channels').append(row); }
      return;
    }
    const channels = current ? current.channels.filter(channel => !state.favorites || item.favorites?.includes(channel.index)) : [];
    if (!channels.length) {
      const empty = document.createElement('div'); empty.className = 'channels-empty'; empty.textContent = current ? 'Отметьте звёздочкой нужные камеры' : 'Каналы появятся после подключения'; $('channels').append(empty); return;
    }
    for (const channel of channels) {
      const row = document.createElement('div'); row.className = 'channel-row';
      const selected = state.multi ? state.tiles.has(channel.index) : channel.index === state.channel;
      const button = makeButton('channel-select' + (selected ? ' selected' : ''), 'channel'); button.dataset.channel = String(channel.index);
      button.setAttribute('aria-pressed', String(selected));
      const number = document.createElement('span'); number.className = 'channel-number'; number.textContent = String(channel.index + 1).padStart(2, '0');
      const name = document.createElement('span'); name.className = 'channel-name'; name.textContent = channel.name;
      button.append(number, name);
      const favorite = Boolean(item.favorites?.includes(channel.index));
      const star = makeButton('channel-star' + (favorite ? ' favorite' : ''), 'favorite'); star.dataset.channel = String(channel.index); star.innerHTML = starIcon;
      star.setAttribute('aria-label', (favorite ? 'Убрать из избранного: ' : 'В избранное: ') + channel.name); star.setAttribute('aria-pressed', String(favorite));
      row.append(button, star); $('channels').append(row);
    }
  }
  function renderHeader() {
    const item = profile(), current = connection();
    $('device-title').textContent = item?.title || 'Добавьте устройство'; $('device-address').textContent = item ? item.host : 'Подключите первый регистратор';
    $('connection-button').hidden = !item; $('connection-button').classList.toggle('is-connected', Boolean(current));
    $('connection-button').disabled = Boolean(state.connecting);
    $('connection-text').textContent = state.connecting === state.selected ? 'Подключение' : current ? 'Подключено' : 'Подключить';
    $('connection-button').querySelector('.status-dot').classList.toggle('connected', Boolean(current));
    $('detail-dot').classList.toggle('connected', Boolean(current));
    $('detail-status').textContent = current ? (current.model || 'XMEye') + ' · ' + current.channels.length + ' каналов' : 'Ожидает подключения';
    $('quality-button').textContent = state.quality === 'Extra1' ? 'Дополнительный поток  ⌄' : 'Основной поток  ⌄';
    $('quality-button').disabled = state.multi || (state.playing && state.mode === 'playback');
    $('favorites-filter').setAttribute('aria-pressed', String(state.favorites));
    $('grid-toggle').setAttribute('aria-pressed', String(state.multi));
    $('grid-toggle').disabled=Boolean(state.switchingLayout);
    $('grid-summary').textContent = state.multi ? 'Выбрано ' + state.tiles.size + ' из ' + state.maxStreams : 'Одиночный просмотр';
    document.querySelector('[data-action=edit]').disabled = !item;
  }
  function renderArchiveChannels() {
    const previous = $('archive-channel').value; $('archive-channel').replaceChildren();
    const current = connection();
    if (!current) { const option = new Option('Подключите устройство', ''); $('archive-channel').append(option); }
    else for (const channel of current.channels) $('archive-channel').append(new Option(channel.name, String(channel.index)));
    if (current?.channels.some(x => String(x.index) === previous)) $('archive-channel').value = previous;
    else if (current?.channels[state.channel]) $('archive-channel').value = String(state.channel);
  }
  function emptyPlayer(title, text, action, buttonText, error = false) {
    $('player-empty').hidden = false; $('player-empty').classList.toggle('error-state', error);
    $('empty-title').textContent = title; $('empty-text').textContent = text; $('empty-action').dataset.action = action;
    $('empty-action').textContent = buttonText; $('empty-action').hidden = !buttonText;
    $('player-loading').hidden = true; $('player-caption').hidden = true; $('player-controls').hidden = true;
  }
  function resetEmpty() {
    if (!profile()) emptyPlayer('Добавьте свой регистратор', 'Укажите адрес устройства в локальной сети.', 'add', 'Добавить устройство');
    else if (!connection()) emptyPlayer('Регистратор не подключён', state.savedCredentials.has(state.selected) ? 'Данные входа сохранены. Нажмите «Подключить».' : 'Войдите, чтобы открыть каналы и прямой эфир.', 'connect', 'Подключить регистратор');
    else if (state.multi) emptyPlayer('Выберите камеры для сетки', 'Нажмите на нужные каналы справа. Повторное нажатие убирает камеру.', 'first-channel', 'Добавить первую камеру');
    else emptyPlayer('Выберите камеру', 'Каналы вашего регистратора доступны справа.', 'first-channel', 'Открыть первую камеру');
  }
  function render() { renderDevices(); renderChannels(); renderHeader(); renderArchiveChannels(); if (!state.playing) resetEmpty(); }
  function setView(view) {
    state.view = view; $('live-view').hidden = view !== 'live'; $('archive-view').hidden = view !== 'archive';
    $('live-tab').classList.toggle('active', view === 'live'); $('archive-tab').classList.toggle('active', view === 'archive');
    $('live-tab').setAttribute('aria-selected', String(view === 'live')); $('archive-tab').setAttribute('aria-selected', String(view === 'archive'));
  }
  function focusElement(element) { if (element && !element.disabled) { element.focus({ preventScroll: true }); element.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } }
  function openModal(name) {
    clearTimeout(toastTimer); $('toast').hidden = true;
    state.lastFocus = document.activeElement; state.modal = name; $(name + '-modal').hidden = false;
    focusElement($(name + '-modal').querySelector('input'));
  }
  function closeModal() {
    if (!state.modal) return;
    if (state.modal === 'login') {
      state.loginGeneration++; $('login-password').value = '';
      if (state.connecting) { service('disconnect', { id: state.connecting }).catch(() => {}); state.connecting = null; }
    }
    if (state.modal === 'device') $('profile-password').value = '';
    $(state.modal + '-modal').hidden = true; state.modal = null;
    $('login-submit').disabled = false; $('login-submit').textContent = 'Подключить';
    renderHeader(); renderChannels(); focusElement(state.lastFocus?.isConnected ? state.lastFocus : $('connection-button'));
  }
  function openLogin(error = '') {
    if (!profile()) return editDevice(true);
    $('login-title').textContent = 'Вход в регистратор'; $('login-description').textContent = profile().title + ' · ' + profile().host;
    if (state.modal !== 'login') $('login-username').value = state.savedCredentials.get(state.selected)?.username || 'admin';
    $('login-password').value = ''; showError('login-error', error);
    if (state.modal !== 'login') openModal('login');
  }
  async function editDevice(create) {
    const item = create ? null : profile(); if (!create && !item) return;
    if (item) {
      const response = await service('credentialsInfo', { id: item.id });
      if (response.credentials[0]) state.savedCredentials.set(item.id, response.credentials[0]); else state.savedCredentials.delete(item.id);
    }
    const saved = item ? state.savedCredentials.get(item.id) : null;
    state.editing = item?.id || null; $('device-modal-title').textContent = item ? 'Настройки регистратора' : 'Новый регистратор';
    $('profile-title').value = item?.title || ''; $('profile-host').value = item?.host || ''; $('profile-port').value = String(item?.port || 34567);
    $('profile-channels').value = String(item?.channelCount || 0); $('remove-device').hidden = !item;
    state.forgetCredentials = false;
    $('profile-username').value = saved?.username || ''; $('profile-password').value = '';
    $('profile-password').placeholder = saved ? 'Пароль сохранён' : 'Пароль регистратора';
    $('credential-note').textContent = saved ? 'Данные сохранены. Оставьте пароль пустым, чтобы не менять его.' : 'Данные входа сохраняются отдельно для этого устройства. Пустой логин — ввод при подключении.';
    $('forget-credentials').hidden = !saved; $('forget-credentials').disabled = false;
    showError('profile-error', ''); openModal('device');
  }

  async function connectDevice(credentials) {
    if (state.connecting || state.resolvingCredentials) return;
    const item = profile(); if (!item) return editDevice(true);
    if (!credentials) {
      state.resolvingCredentials = true;
      let response;
      try { response = await service('credentialsInfo', { id: item.id }); }
      finally { state.resolvingCredentials = false; }
      if (state.selected !== item.id) return;
      const saved = response.credentials[0];
      if (!saved) { state.savedCredentials.delete(item.id); return openLogin(); }
      state.savedCredentials.set(item.id, saved); credentials = { useSaved: true };
    }
    const generation = ++state.loginGeneration;
    state.connecting = item.id; $('login-submit').disabled = true; $('login-submit').textContent = 'Подключение';
    showError('login-error', ''); renderHeader(); renderChannels();
    let response = null, failure = null;
    try {
      response = await service('connect', { id: item.id, host: item.host, port: item.port, channelCount: item.channelCount, ...credentials });
      if (generation !== state.loginGeneration) return;
      state.connections.set(item.id, response);
      if (response.credential) state.savedCredentials.set(item.id, response.credential);
    } catch (error) { failure = error.message; }
    finally {
      if (generation === state.loginGeneration) {
        state.connecting = null; $('login-submit').disabled = false; $('login-submit').textContent = 'Подключить'; renderHeader(); renderChannels();
      }
    }
    if (generation !== state.loginGeneration) return;
    if (failure) { if (state.selected === item.id) openLogin(failure); else toast(item.title + ': ' + failure); return; }
    if (state.modal === 'login') closeModal();
    render(); toast(response.credentialsError ? 'Подключено. ' + response.credentialsError : 'Регистратор подключён');
    if (state.selected === item.id) focusElement($('channels').querySelector('.channel-select'));
  }

  const playerCallbacks = {
    metadata: meta => { $('video-info').textContent = meta.width + ' × ' + meta.height + ' · ' + (meta.codec === 'h265' ? 'H.265' : 'H.264'); },
    state: status => {
      if (status === 'loading') { $('player-empty').hidden = true; $('player-loading').hidden = false; $('player-caption').hidden = true; $('player-controls').hidden = false; }
      if (status === 'playing') { $('player-loading').hidden = true; $('player-caption').hidden = false; $('player-controls').hidden = false; }
      if (status === 'ended') { state.playing = false; emptyPlayer('Запись завершена', 'Можно выбрать другую запись или вернуться к прямому эфиру.', 'view-archive', 'К списку записей'); renderHeader(); }
    },
    error: message => { state.playing = false; releaseLease('main', state.mainLease); state.mainLease = null; emptyPlayer('Не удалось открыть видео', message, 'retry', 'Повторить', true); renderHeader(); }
  };
  const hardwarePlayer=new LocalVideoPlayer($('video'),playerCallbacks), softwarePlayer=new LocalSoftwarePlayer($('main-canvas'),playerCallbacks);
  const player={
    stop(){hardwarePlayer.stop();softwarePlayer.stop();},
    start(url,software){$('video').hidden=software;$('main-canvas').hidden=!software;$('video-time').hidden=software;(software?softwarePlayer:hardwarePlayer).start(url);}
  };
  function releaseLease(slot, lease) { return lease ? service('stop', { slot, lease }).catch(() => {}) : Promise.resolve(); }
  function layoutTiles() {
    $('player-shell').hidden = state.tiles.size > 0;
    $('camera-grid').dataset.count = String(state.tiles.size || 1);
    renderHeader();
  }
  function fullscreen(enable = !document.body.classList.contains('fullscreen')) {
    if (enable) { state.screenFocus = document.activeElement; document.body.classList.add('fullscreen'); $('camera-grid').focus({preventScroll:true}); }
    else { document.body.classList.remove('fullscreen'); focusElement(state.screenFocus?.isConnected ? state.screenFocus : $('grid-toggle')); }
  }
  async function removeTile(channel) {
    const tile = state.tiles.get(channel); if (!tile) return;
    state.tiles.delete(channel); tile.player.dispose(); tile.element.remove();
    state.playing = state.tiles.size > 0; layoutTiles(); renderChannels();
    if (!state.playing) resetEmpty();
    await releaseLease(tile.slot, tile.lease);
  }
  async function openTile(channel) {
    const current = connection(); if (!current) return connectDevice();
    if (state.tiles.has(channel)) return;
    if (state.tiles.size >= state.maxStreams) return toast('В сетке можно выбрать до ' + state.maxStreams + ' камер');
    const item = current.channels[channel]; if (!item) return;
    const tile = { channel, slot:'grid-' + channel, lease:null, element:document.createElement('section') };
    tile.element.className = 'camera-tile'; tile.element.dataset.channel = String(channel); tile.element.setAttribute('aria-label',item.name);
    const video = document.createElement('canvas'); video.setAttribute('aria-label',item.name);
    const caption = document.createElement('div'); caption.className = 'tile-caption'; caption.textContent = String(channel+1).padStart(2,'0') + ' · ' + item.name;
    const status = document.createElement('p'); status.className = 'tile-status'; status.textContent = 'Получаем видео';
    const controls = document.createElement('div'); controls.className = 'tile-controls';
    const retry = makeButton('tile-button','grid-retry','Повторить'); retry.dataset.channel = String(channel); retry.hidden = true;
    const remove = makeButton('tile-button','grid-remove','Убрать'); remove.dataset.channel = String(channel); remove.setAttribute('aria-label','Убрать из сетки: '+item.name);
    controls.append(retry,remove); tile.element.append(video,caption,status,controls);
    const alive = () => state.tiles.get(channel) === tile;
    const failed = text => { if (!alive()) return; status.hidden=false; status.textContent=text; retry.hidden=false; tile.element.classList.add('tile-error'); releaseLease(tile.slot,tile.lease); };
    tile.player = new LocalSoftwarePlayer(video, {
      metadata: () => {},
      state: value => { if (!alive()) return; if (value==='playing') { status.hidden=true; tile.element.classList.remove('tile-error'); } else if (value==='ended') failed('Видеопоток завершён'); },
      error: failed
    });
    state.tiles.set(channel,tile); $('camera-grid').insertBefore(tile.element,document.querySelector('.screen-return'));
    state.playing=true; state.mode='live'; layoutTiles(); renderChannels();
    try {
      const result=await service('live',{id:state.selected,channel,quality:'Extra1',slot:tile.slot,software:true});
      if (!alive()) return releaseLease(tile.slot,result.lease);
      tile.lease=result.lease; tile.player.start(result.url);
    } catch (error) { failed(error.message); }
  }
  async function toggleTile(channel) {
    if (state.tiles.has(channel)) await removeTile(channel); else await openTile(channel);
    if (!document.body.classList.contains('fullscreen')) focusElement($('channels').querySelector('[data-action=channel][data-channel="'+channel+'"]'));
  }
  async function stopVideo(update = true) {
    state.playGeneration++; player.stop(); document.body.classList.remove('fullscreen');
    const lease=state.mainLease; state.mainLease=null;
    const tasks=[releaseLease('main',lease), ...[...state.tiles.keys()].map(removeTile)];
    state.playing=false; await Promise.all(tasks); layoutTiles();
    if (update) { resetEmpty(); focusElement($('channels').querySelector('.channel-select.selected') || $('connection-button')); } renderHeader();
  }
  async function play(details) {
    const current = connection(); if (!current) return connectDevice();
    if (details.mode==='playback') { await stopVideo(false); state.multi=false; }
    const generation = ++state.playGeneration; state.lastPlay = details; state.playing = true; state.mode = details.mode;
    player.stop(); setView('live'); $('player-empty').hidden = true; $('player-loading').hidden = false; $('player-controls').hidden = false;
    focusElement(document.querySelector('[data-action=stop]'));
    $('player-mode').textContent = details.mode === 'live' ? 'ЭФИР' : 'ЗАПИСЬ';
    const channel = current.channels[details.channel ?? state.channel]; $('player-camera').textContent = channel?.name || 'Запись';
    renderChannels(); renderHeader();
    try {
      const software=state.native && details.mode==='live' && state.quality==='Extra1';
      const response = await service(details.mode === 'live' ? 'live' : 'playback', { id: state.selected, channel: details.channel, quality: state.quality, key: details.key, slot:'main', software });
      if (generation !== state.playGeneration) return releaseLease('main',response.lease);
      state.mainLease=response.lease;
      player.start(response.url,software);
    } catch (error) { if (generation === state.playGeneration) { state.playing = false; emptyPlayer('Не удалось открыть видео', error.message, 'retry', 'Повторить', true); } }
  }
  function renderRecordings() {
    $('recordings').replaceChildren(); $('recordings-count').textContent = state.recordings.length ? state.recordings.length + ' записей' : '';
    for (const file of state.recordings) {
      const button = makeButton('recording', 'recording'); button.dataset.key = file.key;
      const details = document.createElement('span'), times = document.createElement('span'), date = document.createElement('span'), action = document.createElement('span');
      times.className = 'record-time'; times.textContent = file.begin.slice(11) + ' — ' + file.end.slice(11);
      date.className = 'record-date'; date.textContent = file.begin.slice(0, 10).split('-').reverse().join('.');
      details.append(times, date); action.className = 'record-play'; action.textContent = 'Смотреть →'; button.append(details, action); $('recordings').append(button);
    }
    if (!state.recordings.length) {
      const empty = document.createElement('div'); empty.className = 'archive-empty';
      const heading = document.createElement('h3'), text = document.createElement('p'); heading.textContent = 'Записей за этот период нет'; text.textContent = 'Попробуйте другую дату или камеру.'; empty.append(heading, text); $('recordings').append(empty);
    }
    $('load-more').hidden = !state.nextBegin;
  }
  async function searchArchive(append = false) {
    if (!connection()) return connectDevice();
    const channel = Number($('archive-channel').value), date = $('archive-date').value, from = $('archive-from').value, to = $('archive-to').value;
    if (!date || !from || !to) return showError('archive-error', 'Укажите дату и время');
    const begin = append ? state.nextBegin : date + ' ' + from + ':00', end = date + ' ' + to + ':59';
    if (begin > end) return showError('archive-error', 'Начало периода должно быть раньше окончания');
    const selected = state.selected;
    await stopVideo(false); $('archive-search').disabled = true; $('archive-search').textContent = 'Ищем записи'; showError('archive-error', '');
    try {
      const result = await service('archive', { id: selected, channel, begin, end, append });
      if (selected !== state.selected) return;
      const files = append ? [...state.recordings, ...result.files] : result.files;
      state.recordings = [...new Map(files.map(file => [file.key, file])).values()];
      state.nextBegin = result.truncated && result.nextBegin > begin ? result.nextBegin : null;
      state.lastQuery = { channel, date }; renderRecordings();
      if (result.truncated && !state.nextBegin) toast('Устройство вернуло часть записей. Сузьте период поиска');
    } catch (error) { showError('archive-error', error.message); }
    finally { $('archive-search').disabled = false; $('archive-search').textContent = 'Найти записи'; }
  }

  const actions = {
    async 'select-device'(element) {
      if (state.selected === element.dataset.id) return;
      await stopVideo(false); state.selected = element.dataset.id; state.channel = 0; state.recordings = []; state.nextBegin = null;
      render(); renderRecordings();
      focusElement($('device-list').querySelector('[data-id="' + state.selected + '"]'));
    },
    add: () => editDevice(true), edit: () => editDevice(false), connect: () => connectDevice(),
    async connection() {
      if (!connection()) return connectDevice();
      await stopVideo(false); await service('disconnect', { id: state.selected }); state.connections.delete(state.selected); render();
    },
    'close-modal': closeModal,
    'view-live': () => setView('live'),
    async 'view-archive'() { await stopVideo(false); setView('archive'); renderArchiveChannels(); },
    async channel(element) { state.channel = Number(element.dataset.channel); if (state.multi) await toggleTile(state.channel); else await play({ mode: 'live', channel: state.channel }); },
    'first-channel': () => state.multi ? toggleTile(0) : play({ mode: 'live', channel: 0 }),
    async grid() {
      if (state.switchingLayout) return; state.switchingLayout=true;
      try {
        const wasMulti=state.multi, selected=state.tiles.keys().next().value ?? state.channel;
        await stopVideo(false); state.multi=!wasMulti;if(state.multi)state.quality='Extra1';setView('live'); resetEmpty(); render();
        if (connection()) { if (state.multi) await openTile(selected); else await play({mode:'live',channel:selected}); }
      } finally { state.switchingLayout=false; renderHeader(); }
    },
    'grid-remove': element => removeTile(Number(element.dataset.channel)),
    async 'grid-retry'(element) { const channel=Number(element.dataset.channel); await removeTile(channel); await openTile(channel); },
    favorite(element) {
      const item = profile(), index = Number(element.dataset.channel); if (!item) return;
      item.favorites = item.favorites || []; const found = item.favorites.indexOf(index);
      if (found < 0) item.favorites.push(index); else item.favorites.splice(found, 1);
      persist(); renderChannels(); focusElement($('channels').querySelector('[data-action=favorite][data-channel="' + index + '"]'));
    },
    favorites() { state.favorites = !state.favorites; renderChannels(); renderHeader(); },
    async quality() {
      state.quality = state.quality === 'Extra1' ? 'Main' : 'Extra1'; renderHeader();
      if (state.multi) { const channels=[...state.tiles.keys()]; await stopVideo(false); await Promise.all(channels.map(openTile)); }
      else if (state.playing && state.mode === 'live') await play({ mode: 'live', channel: state.channel });
    },
    stop: () => stopVideo(),
    fullscreen: () => fullscreen(),
    retry() { if (state.lastPlay) play(state.lastPlay); else connectDevice(); },
    recording(element) { play({ mode: 'playback', key: element.dataset.key, channel: state.lastQuery?.channel || 0 }); },
    'load-more': () => searchArchive(true),
    'forget-credentials'() {
      state.forgetCredentials = true;
      $('profile-username').value = ''; $('profile-password').value = ''; $('profile-password').placeholder = 'Новый пароль';
      $('credential-note').textContent = 'Сохранённые данные будут удалены после нажатия «Сохранить».';
      $('forget-credentials').disabled = true;
      focusElement($('device-form').querySelector('button[type=submit]'));
    },
    async remove() {
      const id = state.editing; if (!id) return;
      await service('forgetCredentials', { id }); state.savedCredentials.delete(id); state.connections.delete(id); state.profiles = state.profiles.filter(item => item.id !== id);
      if (state.selected === id) { await stopVideo(false); state.selected = state.profiles[0]?.id || null; }
      persist(); closeModal(); render(); toast('Устройство удалено');
    }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled && actions[button.dataset.action]) Promise.resolve(actions[button.dataset.action](button)).catch(error => toast(error.message));
  });
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); if (state.connecting) return;
    const password = $('login-password').value; $('login-password').value = '';
    await connectDevice({ username: $('login-username').value.trim(), password, remember: true });
  });
  $('device-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (state.savingProfile) return;
    const host = $('profile-host').value.trim(), port = Number($('profile-port').value), count = Number($('profile-channels').value), title = $('profile-title').value.trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.split('.').some(value => Number(value) > 255)) return showError('profile-error', 'Укажите IPv4-адрес регистратора');
    if (!title || !Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(count) || count < 0 || count > 256) return showError('profile-error', 'Проверьте название, порт и количество каналов');
    const previous = state.profiles.find(item => item.id === state.editing);
    const item = { id: previous?.id || 'device-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, host, port, channelCount: count, favorites: previous?.favorites || [] };
    const username = $('profile-username').value.trim(), password = $('profile-password').value;
    const saved = state.savedCredentials.get(item.id);
    state.savingProfile = true;
    const submit = $('device-form').querySelector('button[type=submit]'); submit.disabled = true;
    try {
      if (username) {
        const details = { id: item.id, username };
        if (saved && !password && !state.forgetCredentials) details.keepPassword = true; else details.password = password;
        const response = await service('saveCredentials', details); state.savedCredentials.set(item.id, response.credential);
      } else if (saved) {
        await service('forgetCredentials', { id: item.id }); state.savedCredentials.delete(item.id); state.connections.delete(item.id);
      }
      if (previous && (previous.host !== host || previous.port !== port || previous.channelCount !== count || password || username !== (saved?.username || '') || state.forgetCredentials)) {
        await stopVideo(false); await service('disconnect', { id: item.id }); state.connections.delete(item.id);
      }
    } catch (error) { showError('profile-error', error.message); return; }
    finally { state.savingProfile = false; submit.disabled = false; }
    if (previous) Object.assign(previous, item); else state.profiles.push(item);
    state.selected = item.id; persist(); closeModal(); render(); toast('Настройки сохранены');
  });
  $('archive-form').addEventListener('submit', event => { event.preventDefault(); searchArchive(); });

  function visibleFocusable(root) {
    return [...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary')].filter(element => element.offsetWidth && element.offsetHeight && !element.closest('[hidden]'));
  }
  function navigate(key) {
    const root = state.modal ? $(state.modal + '-modal') : document.body.classList.contains('fullscreen') ? $('camera-grid') : $('app');
    const items = visibleFocusable(root), active = document.activeElement;
    if (!items.includes(active)) return focusElement(items[0]);
    const a = active.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight', positive = key === 'ArrowRight' || key === 'ArrowDown';
    // Traverse a scrollable list before considering controls outside it.
    // Otherwise the fixed Add button can interrupt navigation halfway down the list.
    const list = active.closest('#device-list,#channels');
    if (list && !horizontal) {
      const selector = list.id === 'device-list' ? '.device-button' : active.classList.contains('channel-star') ? '.channel-star' : '.channel-select';
      const peers = visibleFocusable(list).filter(element => element.matches(selector));
      const index = peers.indexOf(active), next = index < 0 ? null : peers[index + (positive ? 1 : -1)];
      if (next) return focusElement(next);
    }
    let winner = null, best = Infinity, bestOverlap = false;
    for (const item of items) {
      if (item === active) continue;
      const b = item.getBoundingClientRect(), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
      const primary = horizontal ? (positive ? b.left - a.right : a.left - b.right) : (positive ? b.top - a.bottom : a.top - b.bottom);
      if (primary < -1) continue;
      const cross = horizontal ? dy : dx;
      const overlap = horizontal ? b.bottom > a.top && b.top < a.bottom : b.right > a.left && b.left < a.right;
      const score = Math.max(0, primary) + Math.abs(cross) * .25;
      if ((overlap && !bestOverlap) || (overlap === bestOverlap && score < best)) { best = score; bestOverlap = overlap; winner = item; }
    }
    focusElement(winner);
  }
  document.addEventListener('keydown', event => {
    const key = event.key, code = event.keyCode;
    if (state.keyboardVisible) return;
    if (key === 'Escape' || code === 461) {
      if (state.modal) { event.preventDefault(); closeModal(); }
      else if (document.body.classList.contains('fullscreen')) { event.preventDefault(); fullscreen(false); }
      else if (state.view === 'archive') { event.preventDefault(); setView('live'); focusElement($('live-tab')); }
      else if (state.playing) { event.preventDefault(); stopVideo(); }
      return;
    }
    if ((state.modal || document.body.classList.contains('fullscreen')) && key === 'Tab') {
      const items = visibleFocusable(state.modal ? $(state.modal + '-modal') : $('camera-grid')), index = items.indexOf(document.activeElement);
      event.preventDefault(); focusElement(items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]); return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
      const tag = document.activeElement.tagName;
      if ((tag === 'INPUT' && ['ArrowLeft', 'ArrowRight'].includes(key)) || tag === 'SELECT') return;
      event.preventDefault(); navigate(key);
    }
    if (!state.modal && (code === 413 || key === 'MediaStop')) { event.preventDefault(); stopVideo(); }
    if (!state.modal && [33, 34, 427, 428].includes(code) && connection()) {
      event.preventDefault(); const step = code === 33 || code === 427 ? 1 : -1;
      if(state.multi){
        if(state.remoteSwitching)return;
        const current=Number(document.activeElement.closest('.camera-tile')?.dataset.channel ?? state.tiles.keys().next().value);
        if(!Number.isInteger(current))return;
        let next=current;const total=connection().channels.length;
        for(let i=0;i<total;i++){next=(next+step+total)%total;if(!state.tiles.has(next))break;}
        if(state.tiles.has(next))return;
        state.remoteSwitching=true;state.channel=next;
        removeTile(current).then(()=>openTile(next)).catch(error=>toast(error.message)).finally(()=>{state.remoteSwitching=false;if(document.body.classList.contains('fullscreen'))$('camera-grid').focus({preventScroll:true});});
        return;
      }
      state.channel = (state.channel + step + connection().channels.length) % connection().channels.length; play({ mode: 'live', channel: state.channel });
    }
  });
  function clock() { $('clock').textContent = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }); }
  setInterval(clock, 1000); clock();
  const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  $('archive-date').value = ['year', 'month', 'day'].map(type => dateParts.find(part => part.type === type).value).join('-');
  window.addEventListener('keyboardStateChange', event => { state.keyboardVisible = Boolean(event.detail && event.detail.visibility); });
  $('video').addEventListener('timeupdate', () => { const n = Math.floor($('video').currentTime || 0); $('video-time').textContent = String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); });
  window.addEventListener('beforeunload', () => { player.stop();for(const tile of state.tiles.values())tile.player.dispose();state.tiles.clear();for (const bridge of bridges) if (bridge.cancel) bridge.cancel(); if (sessionBridge?.cancel) sessionBridge.cancel(); service('stop').catch(() => {}); });
  render(); focusElement($('device-list').querySelector('button') || document.querySelector('[data-action=add]'));
  service('bootstrap').then(response => {
    if(Number.isInteger(response.maxStreams)&&response.maxStreams>0)state.maxStreams=Math.min(6,response.maxStreams);
    state.savedCredentials = new Map((response.credentials || []).map(account => [account.id, account])); render();
    state.service = true; $('service-state').textContent = response.native ? 'Сервис готов' : 'Предпросмотр'; document.querySelector('.network-dot').classList.add('ready');
    if (response.native && window.PalmServiceBridge) { sessionBridge = new PalmServiceBridge(); sessionBridge.onservicecallback = () => {}; sessionBridge.call('luna://local.xmeye.viewer.service/session', JSON.stringify({ subscribe: true })); }
  }).catch(error => { $('service-state').textContent = 'Сервис недоступен'; toast(error.message); });
  setInterval(async () => {
    if (!state.service || !state.connections.size) return;
    try {
      const response = await service('status');
      const connected = new Set(response.devices.filter(item => item.connected).map(item => item.id));
      let changed = false;
      for (const id of state.connections.keys()) if (!connected.has(id)) { state.connections.delete(id); changed = true; }
      if (changed) { if (!connection()) await stopVideo(false); render(); toast('Соединение с регистратором потеряно'); }
    } catch (_) {}
  }, 15000);
})();
