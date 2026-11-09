async page => {
  await page.reload();
  await page.locator('#service-state').getByText('Предпросмотр', { exact: true }).waitFor();
  async function select(title) {
    await page.getByRole('button', { name: title + ' 127.0.0.1', exact: true }).click();
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
  }
  async function connect(title) {
    await select(title);
    await page.getByRole('button', { name: 'Подключить', exact: true }).click();
    await page.getByRole('button', { name: 'Подключено', exact: true }).waitFor();
    if (await page.locator('#login-modal').isVisible()) throw new Error('Account did not survive restart');
  }
  await connect('Стенд Б'); await connect('Стенд А после правки');
  await page.getByRole('button', { name: 'Настройки устройства', exact: true }).click();
  await page.locator('#device-modal').getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.locator('#device-modal').waitFor({ state: 'hidden' });
  await select('Стенд Б');
  await page.getByRole('button', { name: 'Подключено', exact: true }).click();
  await page.getByRole('button', { name: 'Подключить', exact: true }).click();
  await page.getByRole('button', { name: 'Подключено', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Настройки устройства', exact: true }).click();
  const modal = page.locator('#device-modal');
  await modal.getByRole('button', { name: 'Удалить данные входа', exact: true }).click();
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Подключить', exact: true }).click();
  await page.locator('#login-modal').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Настройки устройства', exact: true }).click();
  await modal.getByRole('button', { name: 'Удалить', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  if (await page.locator('.device-button').count() !== 2) throw new Error('Unexpected profile count after cleanup');
  return { bothAccountsSurviveApplicationAndServiceRestart: true, deletingOnePreservesTheOther: true, clearingSavedCredentialsRestoresLoginDialog: true, fixtureProfilesRemoved: true };
}
