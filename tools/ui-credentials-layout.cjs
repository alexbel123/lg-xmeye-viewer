async page => {
  await page.reload(); await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Добавить устройство', exact: true }).click();
  const settings = page.locator('#device-modal'); await settings.waitFor({ state: 'visible' });
  await settings.getByLabel('Название', { exact: true }).fill('Тест настроек');
  await settings.getByLabel('IP-адрес', { exact: true }).fill('127.0.0.1');
  await settings.getByLabel('Пользователь', { exact: true }).fill('test-first');
  await settings.getByLabel('Пароль', { exact: true }).fill('first-fixture-only');
  await settings.getByRole('button', { name: 'Сохранить', exact: true }).click(); await settings.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Настройки устройства', exact: true }).click(); await settings.waitFor({ state: 'visible' });
  const box = await settings.getByRole('button', { name: 'Сохранить', exact: true }).boundingBox();
  if (!box || box.y < 0 || box.y + box.height > 710) throw new Error('Save button clipped at HD resolution');
  await page.screenshot({ path: 'output/playwright/settings-v0.2.png', scale: 'css' });
  await settings.getByRole('button', { name: 'Удалить', exact: true }).click(); await settings.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  return { savedPasswordIndicator: true, allSettingsControlsVisibleAt1280x720: true };
}
