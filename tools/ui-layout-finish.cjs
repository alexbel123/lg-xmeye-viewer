async page => {
  if (new URL(page.url()).port !== '19438') throw new Error('Use isolated port 19438');
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('button',{name:'Настройки устройства',exact:true}).click();
  const modal=page.locator('#device-modal');await modal.waitFor({state:'visible'});
  await modal.getByLabel('Название',{exact:true}).fill('Регистратор — тестовый стенд');
  await modal.getByRole('button',{name:'Сохранить',exact:true}).click();await modal.waitFor({state:'hidden'});
  await page.locator('.channel-select').first().click();
  await page.waitForFunction(()=>document.querySelector('video').currentTime>0.5);
  await page.screenshot({path:'output/playwright/preview-hd-v0.2.1.png',scale:'css'});
  await page.setViewportSize({width:1920,height:1080});
  await page.screenshot({path:'output/playwright/preview-fhd-v0.2.1.png',scale:'css'});
  await page.getByRole('button',{name:'Остановить видео',exact:true}).click();
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('button',{name:'Настройки устройства',exact:true}).click();await modal.waitFor({state:'visible'});
  await page.screenshot({path:'output/playwright/settings-hd-v0.2.1.png',scale:'css'});
  await modal.getByRole('button',{name:'Удалить',exact:true}).click();await modal.waitFor({state:'hidden'});
  await page.evaluate(()=>localStorage.removeItem('viewer.profiles'));
  await page.reload();await page.getByText('Предпросмотр',{exact:true}).waitFor();
  if(await page.locator('.device-button').count()!==0)throw new Error('Fresh installation must have no device profiles');
  return {emptyFirstRunPassed:true,syntheticProfilesRemoved:true,syntheticCredentialsRemoved:true};
}
