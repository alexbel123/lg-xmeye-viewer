async page => {
  const modal = page.locator('#device-modal');
  if (!await modal.isVisible()) await page.getByRole('button', { name: 'Добавить устройство', exact: true }).click();
  await modal.getByLabel('Название', { exact: true }).fill('Тестовый регистратор');
  await modal.getByLabel('IP-адрес', { exact: true }).fill('127.0.0.1');
  await modal.getByLabel('Порт XMEye', { exact: true }).fill('19429');
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Подключить', exact: true }).click();
  return await page.locator('#login-modal').ariaSnapshot();
}
