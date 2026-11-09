async page => {
  if(new URL(page.url()).port!=='19448')throw new Error('Use the separate design preview');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{localStorage.removeItem('viewer.design.v4');localStorage.removeItem('viewer.design.preferences');});
  await page.setViewportSize({width:1920,height:1080});await page.reload();
  await page.getByRole('heading',{name:'Весь объект',exact:true}).waitFor();
  await page.locator('.feed').first().evaluate(element=>new Promise(resolve=>{const image=new Image();image.onload=resolve;image.src=getComputedStyle(element).backgroundImage.slice(5,-2);}));
  await page.screenshot({path:'output/playwright/design-v0.4/01-grid-six.png',scale:'css'});
  const checked=[];
  for(const layout of [1,2,4,6]){
    await page.locator('#layout-options').getByRole('button',{name:'Сетка '+layout,exact:true}).click();
    if(await page.locator('#camera-wall>.camera-tile').count()!==layout)throw new Error('Wrong grid size '+layout);
    if(layout===4){await page.getByRole('button',{name:'Следующая страница',exact:true}).click();const ids=await page.locator('#camera-wall>[data-camera]').evaluateAll(elements=>elements.map(element=>Number(element.dataset.camera)));if(ids.join(',')!=='8,9')throw new Error('Grid change discarded cameras');}
    checked.push(layout);
  }
  await page.getByRole('button',{name:'Открыть камеру 3: Склад',exact:true}).click();
  const enlarged=page.locator('#enlarged');await enlarged.waitFor({state:'visible'});
  const box=await enlarged.boundingBox();if(box.width!==1920||box.height!==1080)throw new Error('Camera not full screen');
  await page.screenshot({path:'output/playwright/design-v0.4/04-enlarged-camera.png',scale:'css'});
  await page.keyboard.press('Escape');if(await enlarged.isVisible())throw new Error('Back did not restore grid');
  if(await page.locator('#camera-wall>.camera-tile').count()!==6)throw new Error('Previous layout lost');
  await page.getByRole('button',{name:'Наборы',exact:true}).click();await page.locator('#drawer').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Открыть набор Периметр',exact:true}).waitFor();await page.getByRole('button',{name:'Открыть набор Рабочие зоны',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/design-v0.4/02-named-sets.png',scale:'css'});
  await page.getByRole('button',{name:'Изменить набор Рабочие зоны',exact:true}).click();
  await page.locator('#editor-backdrop').waitFor({state:'visible'});
  const selected=await page.locator('.pick-camera.selected').evaluateAll(items=>items.map(item=>Number(item.dataset.camera)));
  if(selected.join(',')!=='3,5,8,9')throw new Error('Named set composition wrong');
  await page.screenshot({path:'output/playwright/design-v0.4/03-edit-set.png',scale:'css'});
  await page.getByLabel('Название набора',{exact:true}).fill('Рабочие зоны — вечер');
  await page.getByRole('button',{name:'Переместить камеру 9 выше',exact:true}).click();
  await page.getByRole('button',{name:'Сохранить набор',exact:true}).click();
  await page.getByRole('heading',{name:'Рабочие зоны — вечер',exact:true}).waitFor();
  const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('viewer.design.v4')).find(set=>set.id==='work'));
  if(persisted.cameraIds.join(',')!=='3,5,9,8')throw new Error('Camera order not saved');
  await page.reload();await page.getByRole('button',{name:'Наборы',exact:true}).click();
  await page.getByRole('button',{name:'Открыть набор Рабочие зоны — вечер',exact:true}).waitFor();
  await page.getByRole('button',{name:'Создать набор',exact:true}).click();
  await page.getByLabel('Название набора',{exact:true}).fill('Ночной обход');
  await page.getByRole('button',{name:'Добавить камеру 1: Главный вход',exact:true}).click();
  await page.getByRole('button',{name:'Добавить камеру 5: Погрузка',exact:true}).click();
  await page.locator('#editor-layout-options').getByRole('button',{name:'Сетка 2',exact:true}).click();
  await page.getByRole('button',{name:'Сохранить набор',exact:true}).click();
  await page.getByRole('heading',{name:'Ночной обход',exact:true}).waitFor();
  if(await page.locator('#camera-wall>[data-camera]').count()!==2)throw new Error('New set not applied');
  await page.evaluate(()=>{localStorage.removeItem('viewer.design.v4');localStorage.removeItem('viewer.design.preferences');});await page.reload();
  await page.getByRole('button',{name:'Скрыть панели',exact:true}).click();
  const wall=await page.locator('#camera-wall').boundingBox();if(wall.x!==0||wall.y!==0||wall.width!==1920||wall.height!==1080)throw new Error('Clean mode does not fill screen');
  await page.screenshot({path:'output/playwright/design-v0.4/05-clean-grid.png',scale:'css'});
  await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
  await page.locator('.quick-item[data-action=sets]').click();
  await page.getByRole('button',{name:'Открыть набор Периметр',exact:true}).click();
  if(!await page.locator('body').evaluate(element=>element.classList.contains('clean')))throw new Error('Set change exited clean mode');
  await page.getByRole('button',{name:'Открыть камеру 3: Склад',exact:true}).click();await page.keyboard.press('Escape');
  if(!await page.locator('body').evaluate(element=>element.classList.contains('clean')))throw new Error('Camera Back lost clean mode');
  await page.keyboard.press('Escape');if(await page.locator('body').evaluate(element=>element.classList.contains('clean')))throw new Error('Back failed to restore panels');
  const sizes=[];
  for(const [width,height]of[[1280,720],[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight);
    if(!fits)throw new Error('Document overflow '+width);
    const hide=await page.getByRole('button',{name:'Скрыть панели',exact:true}).boundingBox();if(hide.x+hide.width>width)throw new Error('Header controls clipped '+width);
    await page.getByRole('button',{name:'Изменить набор',exact:true}).click();
    const save=await page.getByRole('button',{name:'Сохранить набор',exact:true}).boundingBox();if(save.y+save.height>height-8||save.y<0)throw new Error('Editor save clipped '+width);
    await page.keyboard.press('Escape');sizes.push(width+'x'+height);
  }
  await page.evaluate(()=>{localStorage.removeItem('viewer.design.v4');localStorage.removeItem('viewer.design.preferences');});await page.reload();
  if(errors.length)throw new Error(errors.join('; '));
  return{passed:true,grids:checked,gridPaginationPreservesSet:true,singleClickFullscreen:true,backRestoresPreviousGrid:true,namedSets:true,renameAndOrderPersist:true,newSetCreation:true,cleanModeMenu:true,sizes,browserErrors:errors,realTvAccess:false};
}
