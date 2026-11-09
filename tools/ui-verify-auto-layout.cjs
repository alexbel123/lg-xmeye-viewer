async page=>{
  if(new URL(page.url()).hostname!=='127.0.0.1'||new URL(page.url()).port!=='19462')throw new Error('Use the isolated synthetic preview on port 19462');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const click=selector=>page.locator(selector).click();
  const call=async(method,data)=>{const response=await page.request.post(new URL('/api/'+method,page.url()).href,{headers:{'X-Viewer-Client':'1'},data});const value=await response.json();check(value.returnValue!==false,value.errorText||method);return value;};
  await page.setViewportSize({width:1920,height:1080});
  const profiles=[{id:'auto-layout-fixture',title:'Синтетический стенд',host:'127.0.0.1',port:19463,channelCount:12,favorites:[]}];
  await call('disconnect',{id:profiles[0].id});await call('saveCredentials',{id:profiles[0].id,username:'test-viewer',password:'synthetic-fixture-only'});
  await call('saveSettings',{profiles,workspace:null});
  await page.evaluate(profiles=>{localStorage.removeItem('viewer.workspace.v1');localStorage.setItem('viewer.profiles',JSON.stringify(profiles));},profiles);await page.reload();
  const playing=count=>page.waitForFunction(n=>document.querySelectorAll('.camera-tile[data-phase="playing"]').length===n,count,{timeout:30000});
  await playing(6);await click('.rail-button[data-action="sets"]');await click('[data-action="new-set"]');await page.locator('#set-name').fill('Автоматическая сетка');
  const preview=page.locator('#editor-layout-preview'),save=page.locator('[data-action="save-set"]');
  check(await save.isDisabled(),'Empty selection can be saved');check(await preview.getAttribute('data-layout')==='','Empty selection claims a grid');
  const transitions=[];
  const verify=async(count,layout)=>{check(await preview.getAttribute('data-layout')===String(layout),'Wrong grid for '+count+' cameras');check(await page.locator('#selected-total').textContent()===String(count),'Wrong selected count');check(await save.isEnabled(),'Nonempty selection cannot be saved');transitions.push({cameras:count,grid:layout});};
  for(const [id,layout]of[[1,1],[2,2],[3,4],[4,4],[5,6],[6,6]]){await click('#camera-picker [data-camera="'+id+'"]');await verify(id,layout);}
  for(const [id,count,layout]of[[6,5,6],[5,4,4],[4,3,4],[3,2,2],[2,1,1]]){await click('#camera-picker [data-camera="'+id+'"]');await verify(count,layout);}
  await click('[data-action="clear-selection"]');check(await save.isDisabled(),'Cleared selection can be saved');
  for(const id of[1,3,5])await click('#camera-picker [data-camera="'+id+'"]');await verify(3,4);
  await page.screenshot({path:'output/auto-layout-three-fhd.png'});
  await click('[data-action="save-set"]');await playing(3);check(await page.locator('#camera-wall').getAttribute('data-layout')==='4','Saved three-camera grid is not four windows');
  await page.reload();await playing(3);check(await page.locator('#camera-wall').getAttribute('data-layout')==='4','Grid did not survive reload');
  await click('.top-actions [data-action="edit-current"]');await verify(3,4);for(const id of[2,4])await click('#camera-picker [data-camera="'+id+'"]');await verify(5,6);await click('[data-action="save-set"]');await playing(5);check(await page.locator('#camera-wall').getAttribute('data-layout')==='6','Five cameras did not open six windows');
  await click('.top-actions [data-action="edit-current"]');for(const id of[5,4,3])await click('#camera-picker [data-camera="'+id+'"]');await verify(2,2);await click('[data-action="save-set"]');await playing(2);check(await page.locator('#camera-wall').getAttribute('data-layout')==='2','Shrinking to two cameras did not shrink grid');
  // Viewing a smaller page is still explicit; cancelling an editor must preserve it.
  await click('#layout-options [data-count="1"]');await playing(1);await click('.top-actions [data-action="edit-current"]');await verify(2,2);await page.keyboard.press('Escape');check(await page.locator('#camera-wall').getAttribute('data-layout')==='1','Cancelling editor changed the saved viewing layout');
  await click('.top-actions [data-action="edit-current"]');for(const id of[3,4,5,6,7])await click('#camera-picker [data-camera="'+id+'"]');await verify(7,6);check((await page.locator('#editor-layout-note').textContent()).includes('2'),'Large set has no pagination explanation');
  const viewports=[];
  for(const [width,height]of[[960,540],[1280,720],[1920,1080]]){
    await page.setViewportSize({width,height});const metrics=await page.locator('#editor-layout-preview').evaluate(node=>{const box=node.getBoundingClientRect(),editor=document.querySelector('.editor').getBoundingClientRect(),save=document.querySelector('[data-action="save-set"]').getBoundingClientRect();return {inside:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,editorInside:editor.left>=0&&editor.right<=innerWidth&&editor.bottom<=innerHeight,saveInside:save.bottom<=innerHeight};});check(metrics.inside&&metrics.editorInside&&metrics.saveInside,'Automatic grid controls overflow '+width+'x'+height);viewports.push({width,height,...metrics});
    if(width===1280)await page.screenshot({path:'output/auto-layout-seven-hd.png'});
  }
  await click('[data-action="save-set"]');await playing(6);await click('[data-action="next-page"]');await playing(1);check((await call('status',{})).streams.length<=6,'Pagination exceeded six streams');
  check(!errors.length,errors.join('; '));return {transitions,savedAndReloaded:true,editedUpAndDown:true,emptySelectionDisabled:true,cancelPreservesViewingLayout:true,largeSetsUsePages:true,viewports,errors};
}
