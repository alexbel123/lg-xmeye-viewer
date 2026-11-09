'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const icons={
    camera:'<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    live:'<rect x="3" y="4" width="18" height="14" rx="3"/><path d="M8 22h8m-4-4v4"/><path d="m10 8 5 3-5 3Z"/>',
    sets:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M7 3h10M6 11h4v6H6zm8 0h4v6h-4z"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    back:'<path d="m10 5-7 7 7 7M3 12h18"/>',
    chevron:'<path d="m7 9 5 5 5-5"/>',
    right:'<path d="m9 5 7 7-7 7"/>',
    left:'<path d="m15 5-7 7 7 7"/>',
    up:'<path d="m5 15 7-7 7 7"/>',
    down:'<path d="m5 9 7 7 7-7"/>',
    close:'<path d="m5 5 14 14M5 19 19 5"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    plus:'<path d="M12 4v16M4 12h16"/>',
    edit:'<path d="m14 5 5 5M4 20l5-1L20 8a2.1 2.1 0 0 0-5-5L4 14Z"/>',
    save:'<path d="M4 4h13l3 3v13H4Zm4 0v6h8V4M8 20v-6h8v6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
  };
  const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||icons.camera)+'</svg>';
  const layoutIcon=number=>{
    const columns=number===1?1:number===6?3:2, rows=number>2?2:1, gap=2, w=(20-gap*(columns-1))/columns, h=(16-gap*(rows-1))/rows;
    let rectangles='';for(let index=0;index<number;index++)rectangles+=`<rect x="${2+(index%columns)*(w+gap)}" y="${4+Math.floor(index/columns)*(h+gap)}" width="${w}" height="${h}" rx=".6"/>`;
    return '<svg viewBox="0 0 24 24" aria-hidden="true">'+rectangles+'</svg>';
  };
  const cameras=[
    {id:1,name:'Главный вход',atlas:0},{id:2,name:'Боковой вход',atlas:0},
    {id:3,name:'Склад',atlas:1},{id:4,name:'Стеллажи',atlas:1},
    {id:5,name:'Погрузка',atlas:2},{id:6,name:'Рампа',atlas:2},
    {id:7,name:'Ресепшен',atlas:3},{id:8,name:'Парковка',atlas:4},
    {id:9,name:'Коридор',atlas:5},{id:10,name:'Двор',atlas:4},
    {id:11,name:'Холл',atlas:3},{id:12,name:'Сервисный вход',atlas:5}
  ];
  const defaults=[
    {id:'perimeter',name:'Периметр',cameraIds:[1,3,5,7],layout:4},
    {id:'work',name:'Рабочие зоны',cameraIds:[3,5,8,9],layout:4},
    {id:'all',name:'Весь объект',cameraIds:[1,3,5,7,8,9],layout:6}
  ];
  let saved;
  try {saved=JSON.parse(localStorage.getItem('viewer.design.v4'));}catch(_){}
  const valid=Array.isArray(saved)&&saved.length&&saved.every(set=>set&&typeof set.id==='string'&&typeof set.name==='string'&&Array.isArray(set.cameraIds)&&set.cameraIds.length&&set.cameraIds.every(id=>cameras.some(camera=>camera.id===id))&&[1,2,4,6].includes(set.layout));
  const state={sets:valid?saved:defaults.map(set=>({...set,cameraIds:[...set.cameraIds]})),activeId:'all',layout:6,page:0,clean:false,drawer:null,enlarged:null,draft:null,labels:true,startLast:true,focusId:3};
  if(!state.sets.some(set=>set.id===state.activeId)){state.activeId=state.sets[0].id;state.layout=state.sets[0].layout;}
  try{const preferences=JSON.parse(localStorage.getItem('viewer.design.preferences'))||{};state.labels=preferences.labels!==false;state.startLast=preferences.startLast!==false;if(state.startLast&&state.sets.some(set=>set.id===preferences.activeId)){state.activeId=preferences.activeId;state.layout=currentSetLayout();}}catch(_){}
  function currentSetLayout(){return state.sets.find(set=>set.id===state.activeId).layout;}
  const current=()=>state.sets.find(set=>set.id===state.activeId);
  const camera=id=>cameras.find(camera=>camera.id===Number(id));
  const cameraCount=number=>number+' '+(number%100>=11&&number%100<=14?'камер':number%10===1?'камера':number%10>=2&&number%10<=4?'камеры':'камер');
  const persist=()=>{localStorage.setItem('viewer.design.v4',JSON.stringify(state.sets));localStorage.setItem('viewer.design.preferences',JSON.stringify({activeId:state.activeId,labels:state.labels,startLast:state.startLast}));};
  function fillIcons(root=document){root.querySelectorAll('[data-icon]').forEach(element=>element.innerHTML=icon(element.dataset.icon));}
  function feedElement(id){const feed=document.createElement('div');feed.className='feed';feed.dataset.atlas=String(camera(id).atlas);return feed;}
  const observer=new ResizeObserver(entries=>entries.forEach(entry=>fitFeed(entry.target)));
  function fitFeed(feed){
    const box=feed.getBoundingClientRect();if(!box.width||!box.height)return;
    const size=Math.max(box.width,box.height), index=Number(feed.dataset.atlas)||0;
    feed.style.backgroundSize=`${size*3}px ${size*2}px`;
    feed.style.backgroundPosition=`${-(index%3)*size-(size-box.width)/2}px ${-Math.floor(index/3)*size-(size-box.height)/2}px`;
  }
  function watchFeeds(){observer.disconnect();document.querySelectorAll('.feed').forEach(feed=>{fitFeed(feed);observer.observe(feed);});}
  function segmentOptions(container,selected,action){
    container.replaceChildren();for(const count of [1,2,4,6]){
      const button=document.createElement('button');button.className='segment'+(count===selected?' active':'');button.dataset.action=action;button.dataset.count=count;
      button.setAttribute('aria-label','Сетка '+count);button.setAttribute('aria-pressed',String(count===selected));button.innerHTML=layoutIcon(count)+'<span>'+count+'</span>';container.append(button);
    }
  }
  function render(){
    const set=current();$('view-title').textContent=set.name;
    $('view-detail').textContent=cameraCount(set.cameraIds.length)+' · Регистратор 1';
    $('online-status').textContent='В сети '+set.cameraIds.length+' из '+set.cameraIds.length;
    segmentOptions($('layout-options'),state.layout,'layout');renderWall();renderPagination();
    document.body.classList.toggle('clean',state.clean);document.body.classList.toggle('no-labels',!state.labels);
    fillIcons();watchFeeds();
  }
  function renderWall(){
    const wall=$('camera-wall'),set=current();wall.replaceChildren();wall.dataset.layout=String(state.layout);
    const pages=Math.max(1,Math.ceil(set.cameraIds.length/state.layout));state.page=Math.min(state.page,pages-1);
    const ids=set.cameraIds.slice(state.page*state.layout,(state.page+1)*state.layout);
    for(let index=0;index<state.layout;index++){
      const id=ids[index],button=document.createElement('button');button.className='camera-tile';
      if(id){
        const info=camera(id);button.dataset.action='open-camera';button.dataset.camera=String(id);button.setAttribute('aria-label','Открыть камеру '+id+': '+info.name);
        if(state.focusId===id)button.classList.add('demo-focus');
        button.append(feedElement(id));
        const top=document.createElement('div');top.className='camera-top';
        const number=document.createElement('span');number.className='channel-id';number.textContent=String(id).padStart(2,'0');
        const title=document.createElement('span');title.className='camera-name';title.textContent=info.name;
        const dot=document.createElement('i');dot.className='live-dot';top.append(number,title,dot);
        const bottom=document.createElement('div');bottom.className='camera-bottom';bottom.innerHTML='<span>19:42:18</span><span class="camera-expand">'+icon('fullscreen')+'Открыть</span>';
        button.append(top,bottom);
      }else{button.classList.add('camera-empty');button.dataset.action='edit-current';button.innerHTML=icon('plus')+'<span>Добавить камеру</span>';}
      wall.append(button);
    }
  }
  function renderPagination(){
    const total=Math.ceil(current().cameraIds.length/state.layout),container=$('pagination');container.replaceChildren();
    if(total<=1)return;
    for(const [action,name] of [['previous-page','left'],['next-page','right']]){
      const button=document.createElement('button');button.className='page-arrow';button.dataset.action=action;button.setAttribute('aria-label',action==='previous-page'?'Предыдущая страница':'Следующая страница');button.innerHTML=icon(name);
      if(action==='previous-page'){button.disabled=state.page===0;container.append(button);const text=document.createElement('span');text.textContent=(state.page+1)+' / '+total;container.append(text);}else{button.disabled=state.page===total-1;container.append(button);}
    }
  }
  function selectSet(id){state.activeId=id;state.layout=current().layout;state.page=0;state.focusId=current().cameraIds[0];persist();closeDrawer(false);render();focusTile(state.focusId);}
  function changeLayout(count){state.layout=count;current().layout=count;state.page=0;persist();render();if(state.drawer==='menu')openDrawer('menu');}
  function focusTile(id){const button=document.querySelector('.camera-tile[data-camera="'+id+'"]');if(button)button.focus({preventScroll:true});}
  function openCamera(id){
    state.enlarged=id;state.focusId=id;closeDrawer(false);
    $('enlarged-name').textContent=String(id).padStart(2,'0')+' · '+camera(id).name;
    $('enlarged-set').textContent=current().name;
    const feed=$('enlarged-feed').querySelector('.feed');feed.dataset.atlas=String(camera(id).atlas);
    $('enlarged').hidden=false;watchFeeds();$('enlarged').querySelector('.back-button').focus({preventScroll:true});
  }
  function closeCamera(){if(state.enlarged===null)return;const id=state.enlarged;state.enlarged=null;$('enlarged').hidden=true;watchFeeds();focusTile(id);}
  function closeDrawer(restore=true){state.drawer=null;document.body.classList.remove('drawer-open');$('drawer').hidden=true;$('drawer-shade').hidden=true;document.querySelectorAll('.rail-button').forEach(button=>button.classList.toggle('active',button.dataset.action==='live'));if(restore)focusTile(state.focusId||current().cameraIds[0]);}
  function makeText(tag,className,text){const element=document.createElement(tag);element.className=className;element.textContent=text;return element;}
  function openDrawer(type){
    state.drawer=type;document.body.classList.add('drawer-open');$('drawer').hidden=false;$('drawer-shade').hidden=false;
    document.querySelectorAll('.rail-button').forEach(button=>button.classList.toggle('active',button.dataset.action===type));
    const content=$('drawer-content');content.replaceChildren();
    $('drawer-title').textContent={sets:'Наборы камер',cameras:'Все камеры',settings:'Настройки',menu:'Управление'}[type];
    $('drawer-eyebrow').textContent=type==='settings'?'ПРОСМОТР НА ТЕЛЕВИЗОРЕ':'БЫСТРЫЙ ДОСТУП';
    if(type==='sets'){
      content.append(makeText('p','drawer-intro','Ваши камеры в нужных сочетаниях. Откройте набор одним нажатием.'));
      for(const set of state.sets){
        const row=document.createElement('div');row.className='set-row'+(set.id===state.activeId?' selected':'');
        const open=document.createElement('button');open.className='set-open';open.dataset.action='select-set';open.dataset.set=set.id;open.setAttribute('aria-label','Открыть набор '+set.name);
        const mini=document.createElement('span');mini.className='set-mini'+(set.layout===6?' six':'');
        for(const id of set.cameraIds.slice(0,set.layout)){const cell=document.createElement('span');cell.append(feedElement(id));mini.append(cell);}
        const description=document.createElement('span');description.className='set-description';description.append(makeText('span','set-title',set.name),makeText('span','set-channel-list',set.cameraIds.map(id=>String(id).padStart(2,'0')).join(' · ')),makeText('span','set-meta',cameraCount(set.cameraIds.length)+'  /  сетка '+set.layout+(set.id===state.activeId?'  ·  Открыт':'')));
        const edit=document.createElement('button');edit.className='set-edit';edit.dataset.action='edit-set';edit.dataset.set=set.id;edit.setAttribute('aria-label','Изменить набор '+set.name);edit.innerHTML=icon('edit');
        open.append(mini,description);row.append(open,edit);content.append(row);
      }
      const add=document.createElement('button');add.className='primary-button new-set';add.dataset.action='new-set';add.innerHTML=icon('plus')+'<span>Создать набор</span>';content.append(add);
      content.append(makeText('div','drawer-divider',''),makeText('div','drawer-caption','ТЕКУЩИЙ ЭКРАН'));
      const copy=document.createElement('button');copy.className='save-current';copy.dataset.action='copy-current';copy.innerHTML=icon('save')+'<span>Сохранить как новый набор</span>';content.append(copy);
      content.append(makeText('p','drawer-footnote','Название, состав камер и сетка сохраняются для следующего просмотра.'));
    }else if(type==='menu'){
      content.append(makeText('div','drawer-caption','РАЗМЕР СЕТКИ'));
      const layouts=document.createElement('div');layouts.className='drawer-layout';const segment=document.createElement('div');segment.className='segments';segmentOptions(segment,state.layout,'layout');layouts.append(segment);content.append(layouts);
      for(const [action,label,symbol,detail] of [['sets','Наборы камер','sets',state.sets.length],['cameras','Выбрать камеры','camera',current().cameraIds.length+' в наборе'],['clean',state.clean?'Показать панели':'Скрыть панели','fullscreen',''],['settings','Настройки','settings','']]){
        const button=document.createElement('button');button.className='quick-item';button.dataset.action=action;button.innerHTML=icon(symbol)+'<span>'+label+'</span><small>'+detail+'</small>'+icon('right');content.append(button);
      }
      content.append(makeText('div','drawer-divider',''),makeText('p','drawer-footnote','Клик по камере или OK — открыть на весь экран. Назад — вернуться к сетке.'));
    }else if(type==='cameras'){
      content.append(makeText('p','drawer-intro','Откройте камеру на весь экран или измените состав текущего набора.'));
      const search=document.createElement('input');search.className='catalog-search';search.placeholder='Номер или название камеры';search.setAttribute('aria-label','Найти камеру');search.addEventListener('input',()=>renderCatalog(search.value));content.append(search);
      const list=document.createElement('div');list.id='catalog-list';content.append(list);renderCatalog('');
      const edit=document.createElement('button');edit.className='primary-button new-set';edit.dataset.action='edit-current';edit.textContent='Изменить камеры набора';content.append(edit);
    }else{
      content.append(makeText('div','drawer-caption','ВИД КАМЕР'));
      for(const [action,label,note,pressed] of [['labels','Подписи камер','Номер, название и время в сетке',state.labels],['remember','Открывать последний набор','Продолжать с привычного экрана',state.startLast]]){
        const button=document.createElement('button');button.className='toggle-row';button.dataset.action=action;button.setAttribute('aria-pressed',String(pressed));const text=document.createElement('span');text.append(makeText('strong','',label),makeText('p','',note));button.append(text);const toggle=document.createElement('span');toggle.className='switch';toggle.innerHTML='<i></i>';button.append(toggle);content.append(button);
      }
      content.append(makeText('div','drawer-divider',''),makeText('div','drawer-caption','РЕГИСТРАТОРЫ'));
      for(const [name,ip] of [['Регистратор 1','192.0.2.10'],['Регистратор 2','198.51.100.10']]){const card=document.createElement('div');card.className='device-card';card.append(makeText('strong','',name),makeText('p','',ip));content.append(card);}
      content.append(makeText('p','drawer-footnote','Данные входа сохраняются отдельно для каждого регистратора.'));
    }
    fillIcons(content);watchFeeds();const first=content.querySelector('button,input');if(first)first.focus({preventScroll:true});
  }
  function renderCatalog(search){
    const list=$('catalog-list');list.replaceChildren();for(const item of cameras.filter(item=>(item.id+' '+item.name).toLowerCase().includes(search.toLowerCase()))){const button=document.createElement('button');button.className='catalog-row';button.dataset.action='open-camera';button.dataset.camera=item.id;button.append(makeText('span','catalog-number',String(item.id).padStart(2,'0')),makeText('span','',item.name),makeText('i','live-dot',''));list.append(button);}
    if(!list.childElementCount)list.append(makeText('p','drawer-intro','Камеры не найдены'));
  }
  function openEditor(id,copy=false){
    const source=id?state.sets.find(set=>set.id===id):null;
    state.draft=source?{...source,id:copy?null:source.id,name:copy?source.name+' — копия':source.name,cameraIds:[...source.cameraIds]}:{id:null,name:'',cameraIds:[],layout:4};
    closeDrawer(false);$('editor-backdrop').hidden=false;$('editor-title').textContent=state.draft.id?'Редактировать набор':'Новый набор';$('set-name').value=state.draft.name;$('editor-error').textContent='';renderEditor();$('set-name').focus({preventScroll:true});
  }
  function renderEditor(){
    segmentOptions($('editor-layout-options'),state.draft.layout,'draft-layout');
    $('selected-total').textContent=state.draft.cameraIds.length;
    const picker=$('camera-picker');picker.replaceChildren();
    for(const item of cameras){
      const selected=state.draft.cameraIds.includes(item.id),button=document.createElement('button');button.className='pick-camera'+(selected?' selected':'');button.dataset.action='pick';button.dataset.camera=item.id;button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',(selected?'Убрать':'Добавить')+' камеру '+item.id+': '+item.name);
      const image=document.createElement('div');image.className='pick-image';image.append(feedElement(item.id));const check=document.createElement('span');check.className='pick-check';check.innerHTML=icon('check');image.append(check);
      const label=document.createElement('span');label.className='pick-label';label.append(makeText('span','',String(item.id).padStart(2,'0')),document.createTextNode(item.name));button.append(image,label);picker.append(button);
    }
    const selection=$('selected-cameras');selection.replaceChildren();
    for(const [index,id] of state.draft.cameraIds.entries()){
      const row=document.createElement('div');row.className='selected-row';const info=document.createElement('div');info.append(makeText('strong','',camera(id).name),makeText('small','','КАМЕРА '+String(id).padStart(2,'0')));row.append(makeText('span','sequence',String(index+1)),info);
      for(const [action,symbol,label] of [['move-up','up','выше'],['move-down','down','ниже']]){const button=document.createElement('button');button.className='move-selection';button.dataset.action=action;button.dataset.camera=id;button.disabled=action==='move-up'?index===0:index===state.draft.cameraIds.length-1;button.setAttribute('aria-label','Переместить камеру '+id+' '+label);button.innerHTML=icon(symbol);row.append(button);}selection.append(row);
    }
    if(!state.draft.cameraIds.length)selection.append(makeText('p','drawer-footnote','Выберите камеры слева.'));
    watchFeeds();
  }
  function closeEditor(){state.draft=null;$('editor-backdrop').hidden=true;focusTile(state.focusId||current().cameraIds[0]);}
  function saveSet(){
    const name=$('set-name').value.trim();if(!name){$('editor-error').textContent='Введите название набора';$('set-name').focus();return;}if(!state.draft.cameraIds.length){$('editor-error').textContent='Выберите хотя бы одну камеру';return;}
    const set={...state.draft,name,id:state.draft.id||'set-'+Date.now().toString(36)};const index=state.sets.findIndex(item=>item.id===set.id);if(index<0)state.sets.push(set);else state.sets[index]=set;persist();closeEditor();selectSet(set.id);toast('Набор «'+name+'» сохранён');
  }
  let toastTimer;
  function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2200);}
  const actions={
    menu:()=>state.drawer?closeDrawer():openDrawer('menu'),sets:()=>openDrawer('sets'),cameras:()=>openDrawer('cameras'),settings:()=>openDrawer('settings'),live:()=>{closeCamera();closeDrawer();},
    'close-drawer':()=>closeDrawer(),'select-set':button=>selectSet(button.dataset.set),layout:button=>changeLayout(Number(button.dataset.count)),
    'edit-set':button=>openEditor(button.dataset.set),'edit-current':()=>openEditor(state.activeId),'new-set':()=>openEditor(null),'copy-current':()=>openEditor(state.activeId,true),
    'close-editor':closeEditor,'save-set':saveSet,'draft-layout':button=>{state.draft.name=$('set-name').value;state.draft.layout=Number(button.dataset.count);renderEditor();},
    pick:button=>{state.draft.name=$('set-name').value;const id=Number(button.dataset.camera),index=state.draft.cameraIds.indexOf(id);if(index<0)state.draft.cameraIds.push(id);else state.draft.cameraIds.splice(index,1);renderEditor();const target=$('camera-picker').querySelector('[data-camera="'+id+'"]');if(target)target.focus({preventScroll:true});},
    'clear-selection':()=>{state.draft.cameraIds=[];renderEditor();},
    'move-up':button=>moveCamera(Number(button.dataset.camera),-1),'move-down':button=>moveCamera(Number(button.dataset.camera),1),
    clean:()=>{state.clean=!state.clean;closeDrawer(false);render();if(state.clean)$('clean-menu').focus({preventScroll:true});},
    'open-camera':button=>openCamera(Number(button.dataset.camera)),'close-camera':closeCamera,
    'previous-page':()=>{if(state.page>0){state.page--;render();}},'next-page':()=>{if(state.page+1<Math.ceil(current().cameraIds.length/state.layout)){state.page++;render();}},
    labels:()=>{state.labels=!state.labels;persist();render();openDrawer('settings');},remember:()=>{state.startLast=!state.startLast;persist();openDrawer('settings');}
  };
  function moveCamera(id,step){const index=state.draft.cameraIds.indexOf(id),target=index+step;if(target<0||target>=state.draft.cameraIds.length)return;[state.draft.cameraIds[index],state.draft.cameraIds[target]]=[state.draft.cameraIds[target],state.draft.cameraIds[index]];renderEditor();const action=step<0?'move-up':'move-down',button=$('selected-cameras').querySelector('[data-action="'+action+'"][data-camera="'+id+'"]');if(button&&!button.disabled)button.focus({preventScroll:true});}
  document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled){document.querySelectorAll('.demo-focus').forEach(element=>element.classList.remove('demo-focus'));actions[button.dataset.action]?.(button);}});
  const focusable=root=>[...root.querySelectorAll('button:not(:disabled),input')].filter(element=>element.offsetWidth&&element.offsetHeight&&!element.closest('[hidden]'));
  function navigate(key){
    const root=state.draft?$('editor-backdrop'):state.drawer?$('drawer'):state.enlarged!==null?$('enlarged'):state.clean?$('camera-wall'):document.body;
    const items=focusable(root),active=document.activeElement;if(!items.includes(active)){items[0]?.focus();return;}
    const a=active.getBoundingClientRect(),horizontal=key==='ArrowLeft'||key==='ArrowRight',positive=key==='ArrowRight'||key==='ArrowDown';let winner=null,best=Infinity,overlapping=false;
    for(const item of items){if(item===active)continue;const b=item.getBoundingClientRect();const primary=horizontal?(positive?b.left-a.right:a.left-b.right):(positive?b.top-a.bottom:a.top-b.bottom);if(primary< -1)continue;const cross=horizontal?(b.top+b.bottom-a.top-a.bottom)/2:(b.left+b.right-a.left-a.right)/2;const overlap=horizontal?b.bottom>a.top&&b.top<a.bottom:b.right>a.left&&b.left<a.right;const score=Math.max(0,primary)+Math.abs(cross)*.25;if((overlap&&!overlapping)||(overlap===overlapping&&score<best)){winner=item;best=score;overlapping=overlap;}}
    if(winner){winner.focus({preventScroll:true});winner.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'||event.keyCode===461){event.preventDefault();if(state.draft)closeEditor();else if(state.drawer)closeDrawer();else if(state.enlarged!==null)closeCamera();else if(state.clean){state.clean=false;render();}return;}
    if(event.key==='Tab'&&(state.draft||state.drawer||state.enlarged!==null)){const root=state.draft?$('editor-backdrop'):state.drawer?$('drawer'):$('enlarged'),items=focusable(root),index=items.indexOf(document.activeElement);event.preventDefault();items[(index+(event.shiftKey?-1:1)+items.length)%items.length]?.focus();return;}
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&document.activeElement.tagName!=='INPUT'){event.preventDefault();navigate(event.key);}
    if(['PageDown','PageUp'].includes(event.key)&&!state.draft&&!state.drawer){event.preventDefault();actions[event.key==='PageDown'?'next-page':'previous-page']();}
  });
  render();
})();
