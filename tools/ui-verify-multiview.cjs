async page => {
  if(new URL(page.url()).port!=='19438') throw new Error('Use isolated preview on port 19438');
  const fixturePort=Number(new URL(page.url()).searchParams.get('fixturePort'))||19429;
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const method of ['disconnect','forgetCredentials']) await page.request.post(new URL('/api/'+method,page.url()).href,{headers:{'X-Viewer-Client':'1'},data:{id:'multiview-fixture'}});
  await page.evaluate(port=>localStorage.setItem('viewer.profiles',JSON.stringify([{id:'multiview-fixture',title:'Стенд: шесть камер',host:'127.0.0.1',port,channelCount:8,favorites:[]}])),fixturePort);
  await page.setViewportSize({width:1920,height:1080});await page.reload();
  await page.getByText('Предпросмотр',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Подключить',exact:true}).click();
  const login=page.locator('#login-modal');await login.waitFor({state:'visible'});
  await login.getByLabel('Пользователь',{exact:true}).fill('test-viewer');await login.getByLabel('Пароль',{exact:true}).fill('synthetic-fixture-only');
  await login.getByRole('button',{name:'Подключить',exact:true}).click();await login.waitFor({state:'hidden'});
  for(let round=0;round<2;round++) for(let channel=0;channel<4;channel++) {
    await page.locator(`.channel-select[data-channel="${channel}"]`).click();
    await page.waitForFunction(()=>{const video=document.querySelector('#video');return video.readyState>=2 && video.currentTime>.35;});
    await page.getByRole('button',{name:'Подключено',exact:true}).waitFor();
  }
  // Overlap several switches before the first one completes.
  await page.evaluate(()=>{for(const channel of [0,1,2,3]) document.querySelector(`.channel-select[data-channel="${channel}"]`).click();});
  await page.waitForFunction(()=>document.querySelector('#video').currentTime>.6);
  if(!await page.locator('#player-camera').textContent().then(text=>text.includes('4'))) throw new Error('Last requested camera did not win');
  await page.getByRole('button',{name:'Сетка камер',exact:true}).click();
  for(const channel of [0,1,2,4]) await page.locator(`.channel-select[data-channel="${channel}"]`).click();
  await page.waitForFunction(()=>{const canvases=[...document.querySelectorAll('.camera-tile canvas')];return canvases.length===5 && canvases.every(canvas=>Number(canvas.dataset.frames)>5);});
  const fiveGrid=await page.locator('#camera-grid').evaluate(element=>({columns:getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,rows:getComputedStyle(element).gridTemplateRows.trim().split(/\s+/).length}));
  if(fiveGrid.columns!==3||fiveGrid.rows!==2)throw new Error('Five cameras do not use a 3x2 grid');
  await page.locator('.channel-select[data-channel="5"]').click();
  await page.waitForFunction(()=>{const canvases=[...document.querySelectorAll('.camera-tile canvas')];return canvases.length===6 && canvases.every(canvas=>Number(canvas.dataset.frames)>5);});
  const before=await page.locator('.camera-tile canvas').evaluateAll(canvases=>canvases.map(canvas=>Number(canvas.dataset.frames)));
  await page.locator('.channel-select[data-channel="6"]').click();
  if(await page.locator('.camera-tile').count()!==6||await page.locator('.camera-tile[data-channel="6"]').count())throw new Error('Seventh camera exceeded the grid limit');
  await page.waitForFunction(previous=>[...document.querySelectorAll('.camera-tile canvas')].every((canvas,index)=>Number(canvas.dataset.frames)>previous[index]+2),before);
  const serviceStatus=await page.request.post(new URL('/api/status',page.url()).href,{headers:{'X-Viewer-Client':'1'},data:{}}).then(response=>response.json());
  if(serviceStatus.streams.length!==6||!serviceStatus.devices[0].connected)throw new Error('Six streams or control connection missing');
  if(!await page.locator('#grid-summary').textContent().then(text=>text.includes('6 из 6')))throw new Error('UI reports wrong camera limit');
  const layouts=[];
  for(const [width,height] of [[960,540],[1280,720],[1366,768],[1920,1080]]) {
    await page.setViewportSize({width,height});
    const fit=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,tiles:[...document.querySelectorAll('.camera-tile')].map(tile=>{const b=tile.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};})}));
    if(fit.overflow || fit.tiles.some(b=>b.x<0||b.y<0||b.right>width||b.bottom>height||b.height<80||b.width<80)) throw new Error('Grid clipped at '+width+'x'+height);
    await page.getByRole('button',{name:'Скрыть интерфейс',exact:true}).click();
    const fullscreen=await page.locator('#camera-grid').boundingBox();
    if(fullscreen.x!==0||fullscreen.y!==0||fullscreen.width!==width||fullscreen.height!==height) throw new Error('Grid does not fill viewport');
    const overlays=await page.locator('.camera-tile .tile-caption').evaluateAll(items=>items.every(item=>getComputedStyle(item).opacity==='0'));
    if(!overlays) throw new Error('Grid overlays not hidden');
    await page.keyboard.press('ArrowRight');
    if(!await page.locator('#camera-grid').evaluate(element=>element.contains(document.activeElement))) throw new Error('Focus escaped full-screen grid');
    if(width===1920) await page.screenshot({path:'output/playwright/grid-fullscreen-v0.3.png',scale:'css'});
    await page.keyboard.press('Escape');
    if(await page.locator('body').evaluate(element=>element.classList.contains('fullscreen'))) throw new Error('Back did not restore interface');
    if(width===1280||width===1920) await page.screenshot({path:`output/playwright/grid-${width}-v0.3.png`,scale:'css'});
    layouts.push(`${width}x${height}`);
  }
  await page.keyboard.press('PageUp');
  await page.waitForFunction(()=>Number(document.querySelector('.camera-tile[data-channel="6"] canvas')?.dataset.frames)>3);
  await page.getByRole('button',{name:'Убрать из сетки: Тестовая камера 2',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.camera-tile').length===5);
  await page.waitForFunction(()=>[...document.querySelectorAll('.camera-tile canvas')].every(canvas=>Number(canvas.dataset.frames)>5));
  await page.locator('.channel-select[data-channel="1"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.camera-tile canvas').length===6 && [...document.querySelectorAll('.camera-tile canvas')].every(canvas=>Number(canvas.dataset.frames)>3));
  await page.getByRole('button',{name:'Сетка камер',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#video').currentTime>.4);
  await page.getByRole('button',{name:'Подключено',exact:true}).waitFor();
  await page.getByRole('button',{name:'Остановить видео',exact:true}).click();
  await page.getByRole('heading',{name:'Выберите камеру',exact:true}).waitFor();
  if(errors.length) throw new Error(errors.join('; '));
  await page.request.post(new URL('/api/forgetCredentials',page.url()).href,{headers:{'X-Viewer-Client':'1'},data:{id:'multiview-fixture'}});
  await page.evaluate(()=>localStorage.removeItem('viewer.profiles'));
  return {passed:true,hotSwitches:12,simultaneousChannels:6,serviceStreams:6,layouts,fiveCameraGrid:'3x2',fullscreenGrid:true,backRestoresInterface:true,gridChannelKeys:true,seventhCameraLimit:true,rejectedSeventhPreservesSixStreams:true,removeAndReaddWithoutStoppingPeers:true,browserErrors:errors};
}
