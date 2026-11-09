'use strict';
(()=>{
  const $=id=>document.getElementById(id),{icon,layoutIcon}=ViewerIcons;
  const api=new RecorderAPI(),store=new WorkspaceStore(localStorage);
  let profiles=[];
  try{const saved=JSON.parse(localStorage.getItem('viewer.profiles')||'[]');if(Array.isArray(saved))profiles=saved.filter(item=>item&&typeof item.id==='string'&&typeof item.host==='string'&&typeof item.title==='string').map(({id,title,host,port,channelCount,favorites})=>({id,title,host,port:Number(port)||34567,channelCount:Number(channelCount)||0,favorites:Array.isArray(favorites)?favorites:[]}));}catch(_){}
  const remembered=store.preferences.remember&&profiles.some(item=>item.id===store.preferences.activeDevice)?store.preferences.activeDevice:null;
  const state={profiles,selected:remembered||profiles[0]?.id||null,connection:null,cameras:[],credentials:new Map(),service:false,connecting:false,connectGeneration:0,selectionGeneration:0,selectionQueue:Promise.resolve(),drawer:null,draft:null,form:null,enlarged:null,focusId:null,page:0,clean:false,keyboard:false,mode:'live',detailGeneration:0,detailLease:null,editing:null,forget:false,archiveFiles:[],archiveNext:null,archiveQuery:null,error:'',saving:false};
  const profile=()=>state.profiles.find(item=>item.id===state.selected)||null;
  const current=()=>store.current(state.selected),view=()=>store.view(state.selected);
  const camera=id=>state.cameras.find(item=>item.id===Number(id))||{id:Number(id),channel:Number(id)-1,name:'Камера '+id};
  const countLabel=n=>n+' '+(n%100>=11&&n%100<=14?'камер':n%10===1?'камера':n%10>=2&&n%10<=4?'камеры':'камер');
  const text=(tag,className,value)=>{const node=document.createElement(tag);node.className=className;node.textContent=value;return node;};
  const button=(action,label,className='outline-button')=>{const node=document.createElement('button');node.type='button';node.dataset.action=action;node.className=className;node.textContent=label;return node;};
  const fillIcons=(root=document)=>root.querySelectorAll('[data-icon]').forEach(node=>node.innerHTML=icon(node.dataset.icon));
  let toastTimer,controlsTimer;
  function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
  let settingsQueue=Promise.resolve(),lastSnapshot='';
  function persistNative(){if(!state.service)return;const serialized=JSON.stringify({profiles:state.profiles,workspace:JSON.parse(localStorage.getItem('viewer.workspace.v1')||'null')});if(serialized===lastSnapshot)return;lastSnapshot=serialized;settingsQueue=settingsQueue.catch(()=>{}).then(()=>api.call('saveSettings',JSON.parse(serialized))).catch(error=>{lastSnapshot='';toast('Не удалось сохранить настройки сервиса: '+error.message);});}
  function persistProfiles(){localStorage.setItem('viewer.profiles',JSON.stringify(state.profiles));persistNative();}
  function saveWorkspace(){try{store.save();persistNative();}catch(error){toast(error.message);}}
  const availableIds=()=>current()?.cameraIds.filter(id=>state.cameras.some(item=>item.id===id))||[];
  const pageTotal=()=>Math.ceil(availableIds().length/(current()?.layout||6));
  function pageIds(){const set=current();if(!set)return[];state.page=Math.min(state.page,Math.max(0,pageTotal()-1));return availableIds().slice(state.page*set.layout,(state.page+1)*set.layout);}
  function desiredIds(){if(!state.connection||state.mode!=='live')return[];const ids=pageIds();return state.enlarged!==null&&!ids.includes(state.enlarged)?[state.enlarged]:ids;}
  const pool=new LiveGrid(api,record=>{mountRecord(record);renderStatus();});
  function synchronize(){return pool.sync(state.selected,desiredIds().map(camera));}
  function streamStatus(id){const record=pool.records.get(Number(id));return record?.phase==='playing'?'playing':record?.phase==='error'||record?.phase==='ended'?'error':'loading';}
  function mountRecord(record){
    const tile=document.querySelector('.camera-tile[data-camera="'+record.id+'"]');
    if(tile){tile.dataset.phase=streamStatus(record.id);const status=tile.querySelector('.stream-status');status.hidden=record.phase==='playing';status.classList.toggle('loading',record.phase==='loading');status.textContent=record.error||'Подключение камеры';const info=tile.querySelector('.tile-resolution');info.textContent=record.width?(record.codec==='h265'?'HEVC':'H.264')+' · '+record.width+'×'+record.height:'';}
    const host=state.enlarged===record.id?$('enlarged-feed').querySelector('.feed'):tile?.querySelector('.feed');
    if(host&&record.canvas.parentElement!==host)host.append(record.canvas);
    if(state.enlarged===record.id){let status=host.querySelector('.stream-status');if(!status){status=text('span','stream-status','');host.append(status);}status.hidden=record.phase==='playing';status.textContent=record.error||'Подключение камеры';$('enlarged-stream-info').textContent=record.width?(record.codec==='h265'?'HEVC':'H.264')+' · '+record.width+'×'+record.height:'';}
  }
  function segments(container,selected,action){
    container.replaceChildren();for(const count of [1,2,4,6]){const item=button(action,'','segment'+(selected===count?' active':''));item.dataset.count=count;item.setAttribute('aria-label','Сетка '+count);item.setAttribute('aria-pressed',String(selected===count));item.innerHTML=layoutIcon(count)+'<span>'+count+'</span>';container.append(item);}
  }
  function renderStatus(){
    const wanted=desiredIds(),online=wanted.filter(id=>pool.records.get(id)?.phase==='playing').length;
    document.body.classList.toggle('connected',Boolean(state.connection));
    $('online-status').textContent=!state.service?'Подключение к сервису':state.connecting?'Подключение к регистратору':state.connection?'В сети '+online+' из '+wanted.length:profile()?'Регистратор не подключён':'Добавьте регистратор';
    $('connection-dot').title=state.connection?'Подключено':state.error||'Нет подключения';
  }
  function renderWall(){
    const wall=$('camera-wall'),set=current();wall.dataset.layout=String(set?.layout||6);
    if(!state.connection){
      const empty=text('div','workspace-empty','');const image=document.createElement('span');image.innerHTML=icon('camera');empty.append(image,text('h2','',state.connecting?'Подключение…':profile()?'Подключите регистратор':'Добавьте регистратор'),text('p','',state.error||(profile()?'Для просмотра используются сохранённые настройки выбранного устройства.':'Укажите адрес и данные входа. Они сохраняются отдельно для каждого устройства.')));
      empty.append(button(profile()?'connect':'new-device',profile()?'Подключить':'Добавить регистратор','primary-button'));wall.replaceChildren(empty);return;
    }
    const ids=pageIds(),fragment=document.createDocumentFragment();
    for(let index=0;index<(set?.layout||6);index++){
      const id=ids[index],item=button(id?'open-camera':'edit-current','','camera-tile');
      if(id){
        item.dataset.camera=id;item.dataset.phase=streamStatus(id);item.setAttribute('aria-label','Открыть камеру '+id+': '+camera(id).name);
        const feed=text('div','feed',''),status=text('span','stream-status loading','Подключение камеры');
        const top=text('div','camera-top','');top.append(text('span','channel-id',String(id).padStart(2,'0')),text('span','camera-name',camera(id).name),text('i','live-dot',''));
        const bottom=text('div','camera-bottom','');bottom.append(text('span','tile-resolution',''));const expand=text('span','camera-expand','');expand.innerHTML=icon('fullscreen')+'Открыть';bottom.append(expand);
        item.append(feed,status,top,bottom);
      }else{item.classList.add('camera-empty');item.innerHTML=icon('plus')+'<span>Добавить камеру</span>';}
      fragment.append(item);
    }
    wall.replaceChildren(fragment);for(const record of pool.records.values())mountRecord(record);
  }
  function renderPagination(){
    const total=pageTotal(),container=$('pagination');container.replaceChildren();
    if(total<=1)return;
    for(const [action,symbol,label]of[['previous-page','left','Предыдущая страница'],['next-page','right','Следующая страница']]){const item=button(action,'','page-arrow');item.setAttribute('aria-label',label);item.innerHTML=icon(symbol);item.disabled=action==='previous-page'?state.page===0:state.page>=total-1;if(action==='previous-page'){container.append(item,text('span','',(state.page+1)+' / '+total));}else container.append(item);}
  }
  function render(sync=true){
    $('view-title').textContent=current()?.name||'Камеры';$('view-detail').textContent=(current()?countLabel(current().cameraIds.length)+' · ':'')+(profile()?.title||'Локальная сеть');
    segments($('layout-options'),current()?.layout||6,'layout');renderWall();renderPagination();renderStatus();
    document.body.classList.toggle('clean',state.clean);document.body.classList.toggle('no-labels',!store.preferences.labels);fillIcons();
    if(sync)synchronize().catch(error=>toast(error.message));
    persistNative();
  }
  function focusElement(element){if(element){element.focus({preventScroll:true});element.scrollIntoView({block:'nearest',inline:'nearest'});}}
  function focusTile(id=state.focusId){focusElement(document.querySelector('.camera-tile[data-camera="'+id+'"]')||document.querySelector('.camera-tile')||document.querySelector('[data-action="new-device"]')||document.querySelector('.brand'));}
  function closeDrawer(restore=true){state.drawer=null;document.body.classList.remove('drawer-open');$('drawer').hidden=true;$('drawer-shade').hidden=true;document.querySelectorAll('.rail-button').forEach(item=>item.classList.toggle('active',item.dataset.action==='live'));if(restore)focusTile();}
  function selectSet(id){store.activate(state.selected,id);state.page=0;state.focusId=current().cameraIds[0];state.enlarged=null;$('enlarged').hidden=true;closeDrawer(false);render();focusTile();}
  function changeLayout(count){if(!current())return toast('Подключите регистратор');store.layout(state.selected,count);state.page=0;render();if(state.drawer==='menu')openDrawer('menu');}
  function wakeControls(){clearTimeout(controlsTimer);document.body.classList.add('controls-awake');document.body.classList.remove('viewer-overlay-hidden');controlsTimer=setTimeout(()=>{if(!state.drawer&&!state.form&&!state.draft){document.body.classList.remove('controls-awake');if(state.enlarged!==null)document.body.classList.add('viewer-overlay-hidden');}},3500);}
  function openCamera(id){
    if(!state.connection)return connectDevice();if(!state.cameras.some(item=>item.id===Number(id)))return;
    state.enlarged=Number(id);state.focusId=Number(id);closeDrawer(false);$('enlarged-name').textContent=String(id).padStart(2,'0')+' · '+camera(id).name;$('enlarged-set').textContent=current()?.name||'';
    $('enlarged-feed').querySelector('.feed').replaceChildren();$('enlarged').hidden=false;for(const record of pool.records.values())mountRecord(record);synchronize().catch(error=>toast(error.message));wakeControls();focusElement($('enlarged-feed'));
  }
  function closeCamera(){if(state.enlarged===null)return;state.enlarged=null;$('enlarged').hidden=true;document.body.classList.remove('viewer-overlay-hidden');for(const record of pool.records.values())mountRecord(record);synchronize().catch(error=>toast(error.message));focusTile();wakeControls();}
  function renderCatalog(search){
    const list=$('catalog-list');list.replaceChildren();
    for(const item of state.cameras.filter(item=>(item.id+' '+item.name).toLowerCase().includes(search.toLowerCase()))){const row=button('open-camera','','catalog-row');row.dataset.camera=item.id;row.setAttribute('aria-label','Открыть камеру '+item.id+': '+item.name);row.append(text('span','catalog-number',String(item.id).padStart(2,'0')),text('span','',item.name),text('i','live-dot',''));list.append(row);}
    if(!list.childElementCount)list.append(text('p','drawer-intro','Камеры не найдены'));
  }
  function openDrawer(type){
    state.drawer=type;document.body.classList.add('drawer-open');$('drawer').hidden=false;$('drawer-shade').hidden=false;wakeControls();
    document.querySelectorAll('.rail-button').forEach(item=>item.classList.toggle('active',item.dataset.action===type));
    $('drawer-title').textContent={sets:'Наборы камер',cameras:'Все камеры',settings:'Настройки',menu:'Управление',devices:'Регистраторы'}[type]||'Управление';$('drawer-eyebrow').textContent=type==='settings'?'ПРОСМОТР НА ТЕЛЕВИЗОРЕ':'БЫСТРЫЙ ДОСТУП';
    const content=$('drawer-content');content.replaceChildren();
    if(type==='sets'){
      content.append(text('p','drawer-intro','Ваши камеры в нужных сочетаниях. Откройте набор одним нажатием.'));
      for(const set of view()?.sets||[]){
        const row=text('div','set-row'+(set.id===current()?.id?' selected':''),''),open=button('select-set','','set-open');open.dataset.set=set.id;open.setAttribute('aria-label','Открыть набор '+set.name);
        const mini=text('span','set-mini'+(set.layout===6?' six':''),'');for(const id of set.cameraIds.slice(0,set.layout)){const cell=document.createElement('span');cell.append(text('span','mini-number',String(id).padStart(2,'0')));mini.append(cell);}
        const description=text('span','set-description','');description.append(text('span','set-title',set.name),text('span','set-channel-list',set.cameraIds.map(id=>String(id).padStart(2,'0')).join(' · ')),text('span','set-meta',countLabel(set.cameraIds.length)+' / сетка '+set.layout));
        const edit=button('edit-set','','set-edit');edit.dataset.set=set.id;edit.setAttribute('aria-label','Изменить набор '+set.name);edit.innerHTML=icon('edit');open.append(mini,description);row.append(open,edit);content.append(row);
      }
      content.append(button('new-set','Создать набор','primary-button new-set'),button('copy-current','Сохранить как новый набор','save-current'),text('p','drawer-footnote','Название, состав камер, порядок и сетка сохраняются отдельно для этого регистратора.'));
    }else if(type==='menu'){
      content.append(text('div','drawer-caption','РАЗМЕР СЕТКИ'));const segment=text('div','segments','');segments(segment,current()?.layout||6,'layout');content.append(segment);
      for(const [action,label,symbol]of[['sets','Наборы камер','sets'],['cameras','Все камеры','camera'],['devices','Регистраторы','camera'],['clean',state.clean?'Показать панели':'Скрыть панели','fullscreen'],['archive','Записи','archive'],['settings','Настройки','settings']]){const item=button(action,'','quick-item');item.innerHTML=icon(symbol);item.append(text('span','',label));content.append(item);}
      content.append(text('p','drawer-footnote','Клик по камере или OK — на весь экран. Назад — вернуться. CH+/CH− переключают камеру при увеличении.'));
    }else if(type==='cameras'){
      if(!state.connection){content.append(text('p','drawer-intro','Подключите регистратор, чтобы получить список камер.'),button('connect','Подключить','primary-button'));}
      else{const search=document.createElement('input');search.className='catalog-search';search.placeholder='Номер или название камеры';search.setAttribute('aria-label','Найти камеру');search.addEventListener('input',()=>renderCatalog(search.value));const list=text('div','','');list.id='catalog-list';content.append(search,list);renderCatalog('');content.append(button('edit-current','Изменить камеры набора','primary-button new-set'));}
    }else{
      if(type==='settings'){
        content.append(text('div','drawer-caption','ВИД КАМЕР'));
        for(const [action,label,note,pressed]of[['labels','Подписи камер','Номер, название и формат видео',store.preferences.labels],['remember','Открывать последний набор','Продолжать с привычного экрана',store.preferences.remember]]){const item=button(action,'','toggle-row');item.setAttribute('aria-pressed',String(pressed));const labelNode=document.createElement('span');labelNode.append(text('strong','',label),text('p','',note));const toggle=text('span','switch','');toggle.innerHTML='<i></i>';item.append(labelNode,toggle);content.append(item);}
        content.append(text('div','drawer-divider',''),text('div','drawer-caption','РЕГИСТРАТОРЫ'));
      }
      for(const item of state.profiles){const card=text('div','device-card'+(item.id===state.selected?' selected':''),''),select=button('select-device','','device-select');select.dataset.device=item.id;select.setAttribute('aria-current',String(item.id===state.selected));select.setAttribute('aria-label','Выбрать регистратор '+item.title);select.append(text('strong','',item.title),text('small','',item.host));const edit=button('edit-device','','square-button');edit.dataset.device=item.id;edit.setAttribute('aria-label','Настройки регистратора '+item.title);edit.innerHTML=icon('edit');card.append(select,edit);content.append(card);}
      content.append(button('new-device','Добавить регистратор','primary-button new-set'));
      if(profile())content.append(button('connect-toggle',state.connection?'Отключить регистратор':'Подключить регистратор','save-current'));
      content.append(text('p','drawer-footnote','Данные входа сохраняются отдельно для каждого регистратора.'),text('p','drawer-footnote',(api.native?'LG webOS':'Предпросмотр')+' · версия 0.4.0 · до 6 потоков'));
    }
    fillIcons(content);focusElement(content.querySelector('input,button'));
  }
  function openEditor(id,copy=false){
    if(!state.connection)return toast('Подключите регистратор');const source=id?view()?.sets.find(set=>set.id===id):null;
    state.draft=source?{id:copy?null:source.id,name:(copy?source.name+' — копия':source.name).slice(0,36),cameraIds:[...source.cameraIds]}:{id:null,name:'',cameraIds:[]};
    closeDrawer(false);$('editor-backdrop').hidden=false;$('editor-title').textContent=state.draft.id?'Редактировать набор':'Новый набор';$('set-name').value=state.draft.name;$('editor-error').textContent='';renderEditor();focusElement($('set-name'));
  }
  function renderEditor(){
    const count=state.draft.cameraIds.length,layout=WorkspaceStore.layoutForCount(count),preview=$('editor-layout-preview');
    preview.dataset.layout=count?String(layout):'';preview.querySelector('.auto-layout-icon').innerHTML=layoutIcon(layout);
    $('editor-layout-value').textContent=count?layout+' '+(layout===1?'окно':layout===6?'окон':'окна'):'Выберите камеры';
    $('editor-layout-note').textContent=count>6?'По 6 камер на странице · страниц: '+Math.ceil(count/6):'По числу выбранных камер';
    document.querySelector('[data-action="save-set"]').disabled=count===0;
    $('selected-total').textContent=count;$('editor-device-note').textContent=profile().title+' · '+state.cameras.length+' каналов';
    const picker=$('camera-picker');picker.replaceChildren();
    for(const item of state.cameras){const selected=state.draft.cameraIds.includes(item.id),pick=button('pick','','pick-camera'+(selected?' selected':''));pick.dataset.camera=item.id;pick.setAttribute('aria-pressed',String(selected));pick.setAttribute('aria-label',(selected?'Убрать':'Добавить')+' камеру '+item.id+': '+item.name);const image=text('div','pick-image','');image.innerHTML=icon('camera');image.append(text('span','picker-number',String(item.id).padStart(2,'0')));const check=text('span','pick-check','');check.innerHTML=icon('check');image.append(check);const label=text('span','pick-label','');label.append(text('span','',String(item.id).padStart(2,'0')),document.createTextNode(item.name));pick.append(image,label);picker.append(pick);}
    const selection=$('selected-cameras');selection.replaceChildren();
    for(const [index,id]of state.draft.cameraIds.entries()){const row=text('div','selected-row',''),info=document.createElement('div');info.append(text('strong','',camera(id).name),text('small','','КАМЕРА '+String(id).padStart(2,'0')));row.append(text('span','sequence',String(index+1)),info);for(const [action,symbol,label]of[['move-up','up','выше'],['move-down','down','ниже']]){const item=button(action,'','move-selection');item.dataset.camera=id;item.disabled=action==='move-up'?index===0:index===state.draft.cameraIds.length-1;item.setAttribute('aria-label','Переместить камеру '+id+' '+label);item.innerHTML=icon(symbol);row.append(item);}selection.append(row);}
    if(!state.draft.cameraIds.length)selection.append(text('p','drawer-footnote','Выберите камеры слева.'));
    let remove=$('delete-set');if(!remove){remove=button('delete-set','Удалить набор','text-button danger-text');remove.id='delete-set';document.querySelector('.editor-footer').insertBefore(remove,$('editor-error'));}remove.hidden=!state.draft.id||(view()?.sets.length||0)<=1;
  }
  function closeEditor(){state.draft=null;$('editor-backdrop').hidden=true;focusTile();}
  function saveSet(){try{const set=store.put(state.selected,{...state.draft,name:$('set-name').value});closeEditor();selectSet(set.id);toast('Набор «'+set.name+'» сохранён');}catch(error){$('editor-error').textContent=error.message;}}
  function moveCamera(id,step){const index=state.draft.cameraIds.indexOf(id),next=index+step;if(next<0||next>=state.draft.cameraIds.length)return;[state.draft.cameraIds[index],state.draft.cameraIds[next]]=[state.draft.cameraIds[next],state.draft.cameraIds[index]];renderEditor();const action=step<0?'move-up':'move-down';focusElement($('selected-cameras').querySelector('[data-action="'+action+'"][data-camera="'+id+'"]'));}
  async function disconnectCurrent(){const id=state.selected;state.connectGeneration++;state.connection=null;state.connecting=false;state.mode='live';state.enlarged=null;$('enlarged').hidden=true;await stopDetail(false);await pool.clear();if(id)await api.call('disconnect',{id}).catch(()=>{});state.cameras=[];}
  async function connectDevice(manual){
    const item=profile();if(!item||state.connecting||!state.service)return;if(state.connection)return true;
    if(!manual&&!state.credentials.has(item.id)){$('login-title').textContent='Вход · '+item.title;$('login-user').value=state.credentials.get(item.id)?.username||'admin';$('login-password').value='';$('login-error').textContent='';state.form='login';$('login-modal').hidden=false;focusElement($('login-user'));return false;}
    const generation=++state.connectGeneration;state.connecting=true;state.error='';render(false);
    try{
      const result=await api.call('connect',{id:item.id,host:item.host,port:item.port,channelCount:item.channelCount,...(manual?{username:manual.username,password:manual.password,remember:true}:{useSaved:true})});
      if(generation!==state.connectGeneration||state.selected!==item.id){if(state.selected!==item.id)api.call('disconnect',{id:item.id}).catch(()=>{});return false;}
      state.connection=result;state.cameras=result.channels.map(channel=>({id:channel.index+1,channel:channel.index,name:channel.name}));if(result.credential)state.credentials.set(item.id,result.credential);store.ensure(item.id,state.cameras.map(camera=>camera.id),(item.favorites||[]).map(id=>id+1));store.preferences.activeDevice=item.id;saveWorkspace();state.page=0;state.error='';state.connecting=false;
      if(state.form==='login'){state.form=null;$('login-modal').hidden=true;$('login-password').value='';}render();if(state.drawer)openDrawer(state.drawer);return true;
    }catch(error){if(generation===state.connectGeneration){state.error=error.message;state.connecting=false;render(false);if(manual)$('login-error').textContent=error.message;else toast(error.message);}return false;}
  }
  function selectDevice(id){
    if(!state.profiles.some(item=>item.id===id))return;const generation=++state.selectionGeneration;
    if(state.connecting&&state.selected)api.call('disconnect',{id:state.selected}).catch(()=>{});
    state.selectionQueue=state.selectionQueue.catch(()=>{}).then(async()=>{if(generation!==state.selectionGeneration)return;await disconnectCurrent();if(generation!==state.selectionGeneration)return;state.selected=id;state.error='';state.page=0;store.preferences.activeDevice=id;saveWorkspace();render(false);if(state.drawer)openDrawer(state.drawer);if(state.credentials.has(id))await connectDevice();});return state.selectionQueue;
  }
  function openDevice(id){
    const item=state.profiles.find(item=>item.id===id);state.editing=item?.id||null;state.forget=false;state.form='device';$('device-modal').hidden=false;$('device-title').textContent=item?'Настройки регистратора':'Новый регистратор';
    $('profile-title').value=item?.title||'';$('profile-host').value=item?.host||'';$('profile-port').value=item?.port||34567;$('profile-channels').value=item?.channelCount||0;$('profile-username').value=state.credentials.get(item?.id)?.username||'admin';$('profile-password').value='';$('profile-error').textContent='';$('delete-device').hidden=!item;$('forget-credentials').hidden=!state.credentials.has(item?.id);$('credential-note').textContent=state.credentials.has(item?.id)?'Пароль сохранён. Пустое поле оставляет прежние данные.':'Сохраните данные входа для этого регистратора.';focusElement($('profile-title'));
  }
  function closeForm(){if(state.form==='device')$('profile-password').value='';if(state.form==='login')$('login-password').value='';for(const id of ['device','login','archive'])$(id+'-modal').hidden=true;state.form=null;if(state.drawer)focusElement($('drawer-content').querySelector('button,input'));else focusTile();}
  async function saveDevice(event){
    event.preventDefault();if(state.saving)return;const title=$('profile-title').value.trim(),host=$('profile-host').value.trim(),port=Number($('profile-port').value),channelCount=Number($('profile-channels').value);
    if(!title||!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)||host.split('.').some(value=>Number(value)>255)||!Number.isInteger(port)||port<1||port>65535||!Number.isInteger(channelCount)||channelCount<0||channelCount>256){$('profile-error').textContent='Проверьте название, IPv4-адрес, порт и количество каналов';return;}
    const previous=state.profiles.find(item=>item.id===state.editing),item={id:previous?.id||'device-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),title,host,port,channelCount,favorites:previous?.favorites||[]};
    const username=$('profile-username').value.trim(),password=$('profile-password').value,saved=state.credentials.get(item.id),submit=$('device-form').querySelector('[type="submit"]');state.saving=true;submit.disabled=true;
    try{
      if(previous?.id===state.selected)await disconnectCurrent();
      if(state.forget){await api.call('forgetCredentials',{id:item.id});state.credentials.delete(item.id);}
      else if(username){const result=await api.call('saveCredentials',{id:item.id,username,...(saved&&!password?{keepPassword:true}:{password})});state.credentials.set(item.id,result.credential);}
      if(previous)Object.assign(previous,item);else state.profiles.push(item);persistProfiles();closeForm();await selectDevice(item.id);toast('Настройки сохранены');
    }catch(error){$('profile-error').textContent=error.message;}finally{state.saving=false;submit.disabled=false;}
  }
  async function deleteDevice(){const id=state.editing;if(!id)return;if(id===state.selected)await disconnectCurrent();else await api.call('disconnect',{id});await api.call('forgetCredentials',{id});state.credentials.delete(id);state.profiles=state.profiles.filter(item=>item.id!==id);store.devices.delete(id);persistProfiles();closeForm();state.selected=null;saveWorkspace();if(state.profiles.length)await selectDevice(state.profiles[0].id);else render();if(state.drawer)openDrawer(state.drawer);}
  const detailPlayer=new LocalVideoPlayer($('detail-video'),{metadata:()=>{$('detail-status').textContent='';},state:phase=>{if(phase==='ended')$('detail-status').textContent='Запись завершена';else if(phase==='playing')$('detail-status').textContent='';},error:message=>{$('detail-status').textContent=message;}});
  async function stopDetail(resume=true){const generation=++state.detailGeneration;detailPlayer.stop();const lease=state.detailLease;state.detailLease=null;$('player-modal').hidden=true;if(state.form==='player')state.form=null;state.mode='live';if(lease)await api.call('stop',{slot:'detail',lease}).catch(()=>{});if(resume&&generation===state.detailGeneration){render();if(state.enlarged!==null)focusElement($('enlarged-feed'));else focusTile();}}
  async function playDetail(mode,file){
    if(!state.connection)return;const id=state.enlarged??pageIds()[0];if(mode==='main'&&!id)return;
    await stopDetail(false);state.mode='detail';await pool.clear();const generation=++state.detailGeneration;state.form='player';$('archive-modal').hidden=true;$('player-modal').hidden=false;$('detail-title').textContent=mode==='main'?camera(id).name+' · основной поток':'Запись · '+(file?.begin||'');$('detail-status').textContent='Подключение видео';focusElement($('player-modal').querySelector('button'));
    try{const result=await api.call(mode==='main'?'live':'playback',mode==='main'?{id:state.selected,channel:camera(id).channel,quality:'Main',slot:'detail'}:{id:state.selected,key:file.key,slot:'detail'});if(generation!==state.detailGeneration){api.call('stop',{slot:'detail',lease:result.lease}).catch(()=>{});return;}state.detailLease=result.lease;detailPlayer.start(result.url);}
    catch(error){if(generation===state.detailGeneration)$('detail-status').textContent=error.message;}
  }
  async function openArchive(){
    if(!state.connection){const connected=await connectDevice();if(!connected)return;}
    closeDrawer(false);state.form='archive';$('archive-modal').hidden=false;$('archive-error').textContent='';$('archive-channel').replaceChildren();for(const item of state.cameras){const option=document.createElement('option');option.value=item.channel;option.textContent=String(item.id).padStart(2,'0')+' · '+item.name;$('archive-channel').append(option);}focusElement($('archive-channel'));
  }
  async function searchArchive(append=false){
    const begin=$('archive-date').value+' '+$('archive-from').value+':00',end=$('archive-date').value+' '+$('archive-to').value+':59';if(!state.connection||begin>end){$('archive-error').textContent='Проверьте период поиска';return;}
    const submit=$('archive-form').querySelector('[type="submit"]');submit.disabled=true;$('archive-error').textContent='Поиск записей…';
    try{const result=await api.call('archive',{id:state.selected,channel:Number($('archive-channel').value),begin:append?state.archiveNext:begin,end,append});state.archiveFiles=append?[...state.archiveFiles,...result.files]:result.files;state.archiveNext=result.nextBegin;$('archive-more').hidden=!state.archiveNext;$('recordings').replaceChildren();for(const file of state.archiveFiles){const item=button('play-recording',file.begin+' — '+file.end,'recording-row');item.dataset.key=file.key;$('recordings').append(item);}$('archive-error').textContent=state.archiveFiles.length?'':'За этот период записей нет';}
    catch(error){$('archive-error').textContent=error.message;}finally{submit.disabled=false;}
  }
  const actions={
    menu:()=>state.drawer?closeDrawer():openDrawer('menu'),sets:()=>openDrawer('sets'),cameras:()=>openDrawer('cameras'),settings:()=>openDrawer('settings'),devices:()=>openDrawer('devices'),live:()=>{closeCamera();closeDrawer();},
    'close-drawer':()=>closeDrawer(),'select-set':item=>selectSet(item.dataset.set),layout:item=>changeLayout(Number(item.dataset.count)),
    'edit-current':()=>openEditor(current()?.id),'edit-set':item=>openEditor(item.dataset.set),'new-set':()=>openEditor(null),'copy-current':()=>openEditor(current()?.id,true),'close-editor':closeEditor,'save-set':saveSet,
    'delete-set':()=>{try{store.remove(state.selected,state.draft.id);closeEditor();state.page=0;render();toast('Набор удалён');}catch(error){$('editor-error').textContent=error.message;}},
    pick:item=>{const id=Number(item.dataset.camera),index=state.draft.cameraIds.indexOf(id);if(index<0)state.draft.cameraIds.push(id);else state.draft.cameraIds.splice(index,1);renderEditor();focusElement($('camera-picker').querySelector('[data-camera="'+id+'"]'));},
    'clear-selection':()=>{state.draft.cameraIds=[];renderEditor();},'move-up':item=>moveCamera(Number(item.dataset.camera),-1),'move-down':item=>moveCamera(Number(item.dataset.camera),1),
    clean:()=>{state.clean=!state.clean;closeDrawer(false);render(false);focusTile();wakeControls();},'open-camera':item=>openCamera(Number(item.dataset.camera)),'close-camera':closeCamera,
    'retry-camera':async()=>{if(state.enlarged!==null){await pool.retry(state.enlarged);synchronize();}},'main-stream':()=>playDetail('main'),
    'previous-page':()=>{if(state.page>0){state.page--;render();focusTile(pageIds()[0]);}},'next-page':()=>{if(state.page+1<pageTotal()){state.page++;render();focusTile(pageIds()[0]);}},
    labels:()=>{store.preferences.labels=!store.preferences.labels;saveWorkspace();document.body.classList.toggle('no-labels',!store.preferences.labels);openDrawer('settings');},remember:()=>{store.preferences.remember=!store.preferences.remember;saveWorkspace();openDrawer('settings');},
    'select-device':item=>selectDevice(item.dataset.device),'edit-device':item=>openDevice(item.dataset.device),'new-device':()=>openDevice(null),'close-device':closeForm,'close-login':closeForm,'delete-device':deleteDevice,
    'forget-credentials':()=>{state.forget=true;$('profile-password').value='';$('credential-note').textContent='Данные входа будут удалены после нажатия «Сохранить».';$('forget-credentials').hidden=true;},
    connect:()=>connectDevice(),'connect-toggle':async()=>{if(state.connection){await disconnectCurrent();render(false);if(state.drawer)openDrawer(state.drawer);}else await connectDevice();},
    archive:openArchive,'close-archive':closeForm,'archive-more':()=>searchArchive(true),'play-recording':item=>playDetail('archive',state.archiveFiles.find(file=>file.key===item.dataset.key)),'close-player':()=>stopDetail()
  };
  document.addEventListener('click',event=>{const item=event.target.closest('[data-action]');if(!item||item.disabled)return;try{const result=actions[item.dataset.action]?.(item);if(result?.catch)result.catch(error=>toast(error.message));}catch(error){toast(error.message);}});
  $('device-form').addEventListener('submit',saveDevice);
  $('login-form').addEventListener('submit',async event=>{event.preventDefault();if(state.connecting)return;const submit=$('login-form').querySelector('[type="submit"]');submit.disabled=true;try{await connectDevice({username:$('login-user').value.trim(),password:$('login-password').value});}finally{submit.disabled=false;}});
  $('archive-form').addEventListener('submit',event=>{event.preventDefault();searchArchive();});
  const focusable=root=>[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(item=>item.offsetWidth&&item.offsetHeight&&!item.closest('[hidden]'));
  function focusRoot(){return state.form?$(state.form+'-modal'):state.draft?$('editor-backdrop'):state.drawer?$('drawer'):state.enlarged!==null?$('enlarged'):state.clean?$('camera-wall'):document.body;}
  function navigate(key){
    const items=focusable(focusRoot()),active=document.activeElement;if(!items.includes(active)){focusElement(items[0]);return;}
    const a=active.getBoundingClientRect(),horizontal=key==='ArrowLeft'||key==='ArrowRight',positive=key==='ArrowRight'||key==='ArrowDown';let winner=null,best=Infinity,overlapping=false;
    const list=active.closest('#catalog-list,#selected-cameras');if(list&&!horizontal){const peers=focusable(list).filter(item=>active.className===item.className),index=peers.indexOf(active),next=peers[index+(positive?1:-1)];if(next){focusElement(next);return;}}
    for(const item of items){if(item===active)continue;const b=item.getBoundingClientRect(),primary=horizontal?(positive?b.left-a.right:a.left-b.right):(positive?b.top-a.bottom:a.top-b.bottom);if(primary< -1)continue;const cross=horizontal?(b.top+b.bottom-a.top-a.bottom)/2:(b.left+b.right-a.left-a.right)/2,overlap=horizontal?b.bottom>a.top&&b.top<a.bottom:b.right>a.left&&b.left<a.right,score=Math.max(0,primary)+Math.abs(cross)*.25;if((overlap&&!overlapping)||(overlap===overlapping&&score<best)){winner=item;best=score;overlapping=overlap;}}focusElement(winner);
  }
  document.addEventListener('keydown',event=>{
    if(state.keyboard)return;wakeControls();
    if(event.key==='Escape'||event.keyCode===461){
      if(state.form||state.draft||state.drawer||state.enlarged!==null||state.clean){event.preventDefault();if(state.form==='player')stopDetail();else if(state.form)closeForm();else if(state.draft)closeEditor();else if(state.drawer)closeDrawer();else if(state.enlarged!==null)closeCamera();else{state.clean=false;render(false);focusTile();}}return;
    }
    if(event.key==='ContextMenu'||event.keyCode===457){event.preventDefault();openDrawer('menu');return;}
    if(event.key==='Tab'&&(state.form||state.draft||state.drawer||state.enlarged!==null||state.clean)){const items=focusable(focusRoot()),index=items.indexOf(document.activeElement);event.preventDefault();focusElement(items[(index+(event.shiftKey?-1:1)+items.length)%items.length]);return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){if(document.activeElement.tagName==='SELECT'||document.activeElement.tagName==='INPUT'&&['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();navigate(event.key);}
    if(!state.form&&!state.draft&&!state.drawer&&(['PageDown','PageUp'].includes(event.key)||[427,428].includes(event.keyCode))){event.preventDefault();const step=event.keyCode===427?1:event.keyCode===428?-1:event.key==='PageDown'?1:-1;if(state.enlarged!==null&&state.cameras.length){const index=state.cameras.findIndex(item=>item.id===state.enlarged);openCamera(state.cameras[(index+step+state.cameras.length)%state.cameras.length].id);}else actions[step>0?'next-page':'previous-page']();}
  });
  document.addEventListener('mousemove',()=>{if(state.clean||state.enlarged!==null)wakeControls();},{passive:true});
  window.addEventListener('keyboardStateChange',event=>{state.keyboard=Boolean(event.detail?.visibility);});
  function clock(){const date=new Date();$('clock').replaceChildren(document.createTextNode(date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})),text('span','',date.toLocaleDateString('ru-RU',{day:'2-digit',month:'long'})));}
  clock();setInterval(clock,1000);const now=new Date();$('archive-date').value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  render(false);
  api.call('bootstrap').then(async result=>{if(!state.profiles.length&&result.settings?.profiles?.length){localStorage.setItem('viewer.profiles',JSON.stringify(result.settings.profiles));if(result.settings.workspace)localStorage.setItem('viewer.workspace.v1',JSON.stringify(result.settings.workspace));location.reload();return;}state.service=true;state.credentials=new Map((result.credentials||[]).map(item=>[item.id,item]));api.hold();persistNative();if(state.selected&&state.credentials.has(state.selected))await connectDevice();else render(false);}).catch(error=>{state.error=error.message;render(false);toast(error.message);});
  setInterval(async()=>{if(!state.connection||state.connecting)return;const connection=state.connection,id=state.selected;try{const result=await api.call('status');if(state.connection===connection&&state.selected===id&&!result.devices.some(item=>item.id===id&&item.connected)){state.connection=null;state.error='Соединение с регистратором потеряно';await pool.clear();render(false);}}catch(_){}},15000);
  window.addEventListener('beforeunload',()=>{detailPlayer.stop();for(const record of pool.records.values())record.player.dispose();api.call('stop').catch(()=>{});api.close();});
})();
