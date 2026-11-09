async page=>{
  await page.setViewportSize({width:1920,height:1080});await page.reload();
  for(const count of [1,2,4]){
    await page.locator('#layout-options').getByRole('button',{name:'Сетка '+count,exact:true}).click();
    await page.screenshot({path:`output/playwright/design-v0.4/grid-${count}.png`,scale:'css'});
  }
  await page.locator('#layout-options').getByRole('button',{name:'Сетка 6',exact:true}).click();
  await page.getByRole('button',{name:'Скрыть панели',exact:true}).click();
  await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
  await page.screenshot({path:'output/playwright/design-v0.4/06-quick-menu.png',scale:'css'});
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.screenshot({path:'output/playwright/design-v0.4/07-settings.png',scale:'css'});
  await page.keyboard.press('Escape');
  return{extraScreens:['grid-1','grid-2','grid-4','06-quick-menu','07-settings']};
}
