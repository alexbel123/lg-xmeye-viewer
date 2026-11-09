async page => {
  if (new URL(page.url()).port !== '19438') throw new Error('Use the isolated layout preview on port 19438');
  const failures = [], results = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (condition, message) => { if (!condition) failures.push(message); };
  const inside = (box, width, height, margin = 0) => box && box.x >= margin - 1 && box.y >= margin - 1 && box.x + box.width <= width - margin + 1 && box.y + box.height <= height - margin + 1;
  for (const method of ['disconnect','forgetCredentials']) await page.request.post(new URL('/api/'+method,page.url()).href,{headers:{'X-Viewer-Client':'1'},data:{id:'layout-fixture'}});
  await page.evaluate(() => localStorage.setItem('viewer.profiles', JSON.stringify([
    { id: 'layout-fixture', title: 'Ш'.repeat(48), host: '127.0.0.1', port: 19429, channelCount: 64, favorites: [] },
    ...Array.from({ length: 8 }, (_, index) => ({ id: 'layout-' + index, title: 'Дополнительный регистратор ' + (index + 1), host: '192.0.2.' + (index + 1), port: 34567, channelCount: 0, favorites: [] }))
  ])));
  await page.setViewportSize({ width:1920, height:1080 }); await page.reload();
  await page.getByText('Предпросмотр', { exact:true }).waitFor();
  await page.getByRole('button', { name:'Подключить', exact:true }).click();
  const login = page.locator('#login-modal'); await login.waitFor({ state:'visible' });
  for (const [width,height] of [[960,540],[1280,720],[1366,768],[1600,900],[1920,1080]]) {
    await page.setViewportSize({ width,height });
    assert(inside(await login.locator('.modal').boundingBox(),width,height,20), `Login bounds ${width}`);
    await login.getByRole('button',{name:'Подключить',exact:true}).focus();
    assert(inside(await page.locator('#login-submit').boundingBox(),width,height,20), `Login submit ${width}`);
  }
  await login.getByLabel('Пользователь',{exact:true}).fill('test-viewer');
  await login.getByLabel('Пароль',{exact:true}).fill('synthetic-fixture-only');
  await login.getByRole('button',{name:'Подключить',exact:true}).click(); await login.waitFor({state:'hidden'});
  await page.waitForFunction(() => document.querySelectorAll('.channel-select').length === 64);
  for (const [width,height] of [[960,540],[1280,600],[1280,720],[1366,768],[1600,900],[1920,1080]]) {
    await page.setViewportSize({ width,height });
    const dimensions = await page.evaluate(() => ({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
    assert(dimensions.width===dimensions.scrollWidth && dimensions.height===dimensions.scrollHeight, `Document overflow ${width}x${height}`);
    assert(inside(await page.locator('.channels-panel').boundingBox(),width,height,8), `Channels clipped ${width}x${height}`);
    const title = await page.locator('#device-title').boundingBox(), headerRight = await page.locator('.header-right').boundingBox();
    assert(title.x+title.width < headerRight.x, `Long title overlaps controls ${width}`);
    assert(inside(await page.locator('#empty-action').boundingBox(),width,height,8), `Empty player action clipped ${width}`);
    await page.locator('.channel-select').first().focus();
    for(let index=1;index<64;index++) await page.keyboard.press('ArrowDown');
    const focusedChannel = await page.evaluate(() => document.activeElement.dataset.channel);
    assert(focusedChannel==='63', `Remote cannot reach channel 64 at ${width}: ${focusedChannel}`);
    assert(inside(await page.locator('.channel-select').last().boundingBox(),width,height,8), `Last channel not scrolled into view ${width}`);
    await page.locator('.device-button').first().focus();
    for(let index=1;index<9;index++) await page.keyboard.press('ArrowDown');
    assert(await page.locator('.device-button').last().evaluate(element => element===document.activeElement), `Remote cannot reach last recorder ${width}`);
    assert(inside(await page.locator('.device-button').last().boundingBox(),width,height,8), `Last recorder clipped ${width}`);
    await page.getByRole('button',{name:'Настройки устройства',exact:true}).click();
    const settings = page.locator('#device-modal'); await settings.waitFor({state:'visible'});
    assert(inside(await settings.locator('.modal').boundingBox(),width,height,20), `Settings bounds ${width}`);
    assert(await settings.getByRole('button',{name:'Удалить данные входа',exact:true}).isVisible(), `Saved credential control missing ${width}`);
    for(let index=0;index<10;index++) await page.keyboard.press('ArrowDown');
    for(let index=0;index<3;index++) await page.keyboard.press('ArrowRight');
    const save = settings.getByRole('button',{name:'Сохранить',exact:true});
    assert(await save.evaluate(element => element===document.activeElement), `Save unreachable with remote ${width}`);
    assert(inside(await save.boundingBox(),width,height,20), `Save clipped after remote scroll ${width}`);
    if(width===1280 && height===720) await page.screenshot({path:'output/playwright/settings-hd-v0.2.1.png',scale:'css'});
    await page.keyboard.press('Escape');
    await page.getByRole('tab',{name:'Записи',exact:true}).click();
    await page.getByRole('combobox',{name:'Камера',exact:true}).selectOption('63');
    await page.getByLabel('Дата',{exact:true}).fill('2026-11-04');
    // On short viewports, focus navigation scrolls the archive pane to the filters.
    await page.locator('#archive-search').focus();
    assert(inside(await page.locator('#archive-search').boundingBox(),width,height,8), `Archive search unreachable ${width}`);
    const archiveOverflow = await page.locator('#archive-view').evaluate(element => element.scrollWidth > element.clientWidth+1);
    assert(!archiveOverflow, `Archive horizontal overflow ${width}`);
    if(width===1280 && height===720) await page.screenshot({path:'output/playwright/archive-hd-v0.2.1.png',scale:'css'});
    await page.getByRole('tab',{name:'Прямой эфир',exact:true}).click();
    await page.locator('.channel-select').first().click();
    await page.waitForFunction(() => { const v=document.querySelector('video'); return v.videoWidth===640 && v.readyState>=2 && v.currentTime>0.3; });
    const videoFit = await page.locator('video').evaluate(element => getComputedStyle(element).objectFit);
    assert(videoFit==='contain', `Video aspect ratio not preserved ${width}`);
    if(height>=720) await page.screenshot({path:`output/playwright/live-${width}-v0.2.1.png`,scale:'css'});
    await page.getByRole('button',{name:'На весь экран',exact:true}).click();
    const fullscreen = await page.locator('#player-shell').boundingBox();
    assert(fullscreen.x===0 && fullscreen.y===0 && fullscreen.width===width && fullscreen.height===height, `Fullscreen bounds ${width}`);
    await page.keyboard.press('ArrowLeft');
    assert(await page.locator('#player-shell').evaluate(element => element.contains(document.activeElement)), `Focus escaped fullscreen ${width}`);
    await page.keyboard.press('Escape');
    assert(!await page.locator('body').evaluate(element => element.classList.contains('fullscreen')), `Back failed ${width}`);
    await page.getByRole('button',{name:'Остановить видео',exact:true}).click();
    await page.getByRole('heading',{name:'Выберите камеру',exact:true}).waitFor();
    results.push({width,height,overflow:false,channels:64,remoteScroll:true,settings:true,archive:true,video:'640x360 contain',fullscreen:true});
  }
  // A physical 4K raster at a 1920x1080 logical viewport; webOS itself scales its FHD canvas.
  const highDpi = await page.context().browser().newContext({viewport:{width:1920,height:1080},deviceScaleFactor:2});
  try {
    const highPage=await highDpi.newPage(); await highPage.goto(page.url());
    await highPage.getByText('Предпросмотр',{exact:true}).waitFor();
    const raster = await highPage.evaluate(() => ({css:[innerWidth,innerHeight],raster:[innerWidth*devicePixelRatio,innerHeight*devicePixelRatio]}));
    assert(raster.raster[0]===3840 && raster.raster[1]===2160,'4K raster setup');
    await highPage.screenshot({path:'output/playwright/raster-4k-v0.2.1.png',scale:'device'});
    results.push({physicalRaster:raster.raster,logicalViewport:raster.css,kind:'Browser high-DPI emulation, not a physical TV test'});
  } finally { await highDpi.close(); }
  await page.setViewportSize({width:1920,height:1080});
  assert(errors.length===0,'Browser errors: '+errors.join('; '));
  if(failures.length) throw new Error(failures.join('\n'));
  return {passed:true,results,browserErrors:errors,realCredentialsUsed:false};
}
