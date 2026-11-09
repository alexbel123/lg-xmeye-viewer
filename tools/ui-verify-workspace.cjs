async page=>{
  if(new URL(page.url()).hostname!=='127.0.0.1'||!['19458','19461'].includes(new URL(page.url()).port))throw new Error('Use the isolated synthetic preview on port 19458 or 19461');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1920,height:1080});
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const click=selector=>page.locator(selector).click();
  const playing=async count=>page.waitForFunction(n=>document.querySelectorAll('.camera-tile[data-phase="playing"]').length===n,count,{timeout:40000});
  const status=async()=>{const response=await page.request.post(new URL('/api/status',page.url()).href,{headers:{'X-Viewer-Client':'1'},data:{}});return response.json();};
  const selected=()=>page.locator('.camera-tile[data-camera]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.camera)));
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('viewer.workspace.v1')));
  await page.request.post(new URL('/api/disconnect',page.url()).href,{headers:{'X-Viewer-Client':'1'},data:{id:'workspace-fixture-264'}});
  await page.request.post(new URL('/api/saveCredentials',page.url()).href,{headers:{'X-Viewer-Client':'1'},data:{id:'workspace-fixture-264',username:'test-viewer',password:'synthetic-fixture-only'}});
  await page.evaluate(()=>{localStorage.removeItem('viewer.workspace.v1');localStorage.setItem('viewer.profiles',JSON.stringify([{id:'workspace-fixture-264',title:'Синтетический стенд',host:'127.0.0.1',port:19459,channelCount:12,favorites:[]}]));});
  await page.reload();
  await playing(6);
  const ids=await selected();check(JSON.stringify(ids)==='[1,2,3,4,5,6]','Initial six cameras');
  for(const layout of [1,2,4,6]){await click('#layout-options [data-count="'+layout+'"]');await playing(layout);check((await status()).streams.length===layout,'Stream count follows layout '+layout);check((await saved()).devices[0].sets[0].cameraIds.length===6,'Layout lost cameras');}
  // Enlarging an existing tile must reuse its decoder and leave all six streams alive.
  await page.evaluate(()=>window.qaCanvas=document.querySelector('.camera-tile canvas'));
  await click('.camera-tile[data-camera="1"]');
  check(await page.evaluate(()=>document.querySelector('#enlarged-feed canvas')===window.qaCanvas),'Fullscreen recreated the decoder');
  check((await status()).streams.length===6,'Fullscreen changed stream count');
  for(let i=0;i<7;i++)await page.keyboard.press('PageDown');
  await page.waitForFunction(()=>Number(document.querySelector('#enlarged-feed canvas')?.dataset.frames)>3,{},{timeout:30000});
  check((await status()).streams.length===1,'Outside-grid fullscreen must fit within six-stream limit');
  await page.keyboard.press('Escape');await playing(6);
  const makeSet=async(name,ids,layout=4)=>{
    await click('.rail-button[data-action="sets"]');await click('[data-action="new-set"]');await page.locator('#set-name').fill(name);
    for(const id of ids)await click('#camera-picker [data-camera="'+id+'"]');
    check(await page.locator('#editor-layout-preview').getAttribute('data-layout')===String(layout),'Automatic editor layout');await click('[data-action="save-set"]');await playing(Math.min(ids.length,layout));
  };
  await makeSet('Вход · 1357',[1,3,5,7]);check(JSON.stringify(await selected())==='[1,3,5,7]','First named set');
  await makeSet('Двор · 3589',[3,5,8,9]);check(JSON.stringify(await selected())==='[3,5,8,9]','Second named set');
  await page.reload();await playing(4);check(await page.locator('#view-title').textContent()==='Двор · 3589','Named set did not survive reload');
  await click('.top-actions [data-action="edit-current"]');await click('[data-action="move-up"][data-camera="8"]');await page.locator('#set-name').fill('Двор');await click('[data-action="save-set"]');await playing(4);check(JSON.stringify(await selected())==='[3,8,5,9]','Camera ordering');
  await makeSet('Все каналы',[1,2,3,4,5,6,7,8,9],6);await click('[data-action="next-page"]');await playing(3);check(JSON.stringify(await selected())==='[7,8,9]','Second page');
  await click('[data-action="previous-page"]');await playing(6);
  await click('[data-action="clean"]');check(await page.evaluate(()=>{const r=document.querySelector('#camera-wall').getBoundingClientRect();return r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight;}),'Clean grid does not fill screen');
  await page.keyboard.press('ContextMenu');check(await page.locator('#drawer').isVisible(),'Remote menu in clean mode');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  // Keep the hardware-player and archive paths functional after replacing the shell.
  await click('.camera-tile[data-camera="1"]');await click('[data-action="main-stream"]');
  await page.waitForFunction(()=>document.querySelector('#detail-video').videoWidth>0,{},{timeout:30000});check((await status()).streams.length===1,'Main stream did not release grid');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await playing(6);
  await page.keyboard.press('ContextMenu');await click('[data-action="archive"]');await page.locator('#archive-date').fill('2026-11-04');await page.locator('#archive-form button[type="submit"]').click();await click('.recording-row');await page.waitForFunction(()=>document.querySelector('#detail-video').videoWidth>0,{},{timeout:30000});await page.keyboard.press('Escape');await playing(6);
  const layouts=[];
  for(const [width,height]of[[960,540],[1280,720],[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});await click('.top-actions [data-action="edit-current"]');
    const geometry=await page.locator('.editor').evaluate(node=>{const r=node.getBoundingClientRect(),save=node.querySelector('[data-action="save-set"]').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,saveBottom:save.bottom,width:innerWidth,height:innerHeight};});
    check(geometry.x>=0&&geometry.y>=0&&geometry.right<=width+1&&geometry.bottom<=height+1&&geometry.saveBottom<=height,'Editor outside '+width+'x'+height);layouts.push({width,height,editorFits:true});await page.keyboard.press('Escape');
  }
  await page.screenshot({path:'output/workspace-verified.png'});
  await page.evaluate(()=>{for(const count of [1,6,2,4,6,1,6])document.querySelector('#layout-options [data-count="'+count+'"]').click();});await playing(6);check((await status()).streams.length===6,'Rapid layouts left orphan streams');
  await click('.rail-button[data-action="settings"]');await click('[data-action="new-device"]');
  await page.locator('#profile-title').fill('Стенд HEVC');await page.locator('#profile-host').fill('127.0.0.1');await page.locator('#profile-port').fill('19460');await page.locator('#profile-username').fill('test-viewer');await page.locator('#profile-password').fill('synthetic-fixture-only');await click('#device-form button[type="submit"]');
  await page.waitForFunction(()=>document.querySelector('#device-modal').hidden&&document.querySelector('#view-detail').textContent.includes('Стенд HEVC'),{},{timeout:30000});await playing(6);check(await page.locator('#view-title').textContent()==='Основной набор','Sets crossed recorder profiles');
  await page.waitForFunction(()=>[...document.querySelectorAll('.camera-tile canvas')].length===6&&[...document.querySelectorAll('.camera-tile canvas')].every(node=>node.dataset.codec==='h265'&&Number(node.dataset.frames)>5),{},{timeout:40000});
  await page.reload();await playing(6);check(await page.locator('#view-title').textContent()==='Основной набор','HEVC saved login failed');
  await page.waitForFunction(async()=>{const response=await fetch('/api/bootstrap',{method:'POST',headers:{'Content-Type':'application/json','X-Viewer-Client':'1'},body:'{}'});const value=await response.json();return value.settings?.profiles?.length===2&&value.settings.workspace?.activeDevice===value.settings.profiles.find(item=>item.port===19460)?.id;});
  await page.evaluate(()=>{localStorage.removeItem('viewer.profiles');localStorage.removeItem('viewer.workspace.v1');});await page.reload();await playing(6);check(await page.locator('#view-title').textContent()==='Основной набор','Settings did not recover after app data reset');
  await click('.rail-button[data-action="settings"]');await click('[data-action="select-device"][data-device="workspace-fixture-264"]');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#view-detail').textContent.includes('Синтетический стенд'));await playing(6);check(await page.locator('#view-title').textContent()==='Все каналы','Recorder workspace did not restore');
  check(!errors.length,'Browser errors: '+errors.join('; '));
  check(!/synthetic-fixture-only|"password"|"hash"/.test(await page.evaluate(()=>JSON.stringify(localStorage))),'Credentials leaked into browser settings');
  return {sixCameras:true,codecs:['h264','h265'],hotFullscreenSwitches:7,rapidLayouts:true,layouts:[1,2,4,6],namedSetsPersist:true,recorderIsolationAndSavedLogins:true,reordering:true,pagination:true,fullscreenReusesDecoder:true,cleanGrid:true,remoteMenu:true,mainAndArchive:true,resolutions:layouts,errors};
}
