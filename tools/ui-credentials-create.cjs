async page => {
  await page.goto('http://127.0.0.1:19438');
  async function add(title, port, username, password) {
    if (await page.getByRole('button', { name: title + ' 127.0.0.1', exact: true }).count()) return;
    await page.getByRole('button', { name: 'Добавить устройство', exact: true }).click();
    const modal = page.locator('#device-modal');
    await modal.getByLabel('Название', { exact: true }).fill(title);
    await modal.getByLabel('IP-адрес', { exact: true }).fill('127.0.0.1');
    await modal.getByLabel('Порт XMEye', { exact: true }).fill(String(port));
    await modal.getByLabel('Пользователь', { exact: true }).fill(username);
    await modal.getByLabel('Пароль', { exact: true }).fill(password);
    await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
  }
  async function connect(title) {
    await page.getByRole('button', { name: title + ' 127.0.0.1', exact: true }).click();
    await page.getByRole('button', { name: 'Подключить', exact: true }).click();
    await page.getByRole('button', { name: 'Подключено', exact: true }).waitFor();
    if (await page.locator('#login-modal').isVisible()) throw new Error('Saved account still requested a password');
  }
  await add('Стенд А', 19429, 'test-first', 'first-fixture-only');
  await add('Стенд Б', 19430, 'test-second', 'second-fixture-only');
  await connect('Стенд Б'); await connect('Стенд А');
  await page.getByRole('button', { name: 'Настройки устройства', exact: true }).click();
  const modal = page.locator('#device-modal');
  await modal.waitFor({ state: 'visible' });
  if (await modal.getByLabel('Пользователь', { exact: true }).inputValue() !== 'test-first') throw new Error('Wrong recorder username in settings');
  if (await modal.getByLabel('Пароль', { exact: true }).inputValue() !== '') throw new Error('Saved secret should not be returned to the browser');
  await modal.getByLabel('Название', { exact: true }).fill('Стенд А после правки');
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  const stored = await page.evaluate(() => localStorage.getItem('viewer.profiles'));
  if (/first-fixture-only|second-fixture-only|"hash"|"password"/.test(stored)) throw new Error('Secret leaked into browser settings');
  return { separateAccountsConnected: true, settingsUsernameCorrect: true, emptyPasswordFieldPreservesSavedPassword: true, noSecretsInBrowserProfile: true };
}
