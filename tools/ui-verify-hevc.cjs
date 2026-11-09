async page => {
  await page.getByRole('button', { name: 'Добавить устройство', exact: true }).click();
  const device = page.locator('#device-modal');
  await device.getByLabel('Название', { exact: true }).fill('Тест HEVC');
  await device.getByLabel('IP-адрес', { exact: true }).fill('127.0.0.1');
  await device.getByLabel('Порт XMEye', { exact: true }).fill('19430');
  await device.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await device.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Подключить', exact: true }).click();
  const login = page.locator('#login-modal');
  await login.getByLabel('Пользователь', { exact: true }).fill('test-viewer');
  await login.getByLabel('Пароль', { exact: true }).fill('synthetic-fixture-only');
  await login.getByRole('button', { name: 'Подключить', exact: true }).click();
  await login.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '01 Тестовая камера 1', exact: true }).click();
  await page.waitForFunction(() => { const video = document.getElementById('video'); return video.readyState >= 2 && video.currentTime > 1; }, null, { timeout: 15000 });
  const result = await page.locator('#video').evaluate(element => ({ width: element.videoWidth, height: element.videoHeight, currentTime: element.currentTime, error: element.error?.code || null }));
  const codecText = await page.locator('#video-info').textContent();
  if (result.width !== 640 || result.height !== 360 || result.error || !codecText.includes('H.265')) throw new Error('HEVC playback failed');
  await page.getByRole('button', { name: 'Остановить видео', exact: true }).click();
  await page.getByRole('button', { name: 'Подключено', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки устройства', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.locator('#device-modal').waitFor({ state: 'hidden' });
  return { hevcDecoded: true, ...result };
}
