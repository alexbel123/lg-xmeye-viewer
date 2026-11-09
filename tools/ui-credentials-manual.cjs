async page => {
  await page.reload();
  if (await page.locator('#login-modal').isVisible()) await page.keyboard.press('Escape');
  while (await page.getByRole('button', { name: /^Ручной вход.*127\.0\.0\.1$/ }).count()) {
    await page.getByRole('button', { name: /^Ручной вход.*127\.0\.0\.1$/ }).first().click();
    await page.getByRole('button', { name: 'Настройки устройства', exact: true }).click();
    const existing = page.locator('#device-modal'); await existing.waitFor({ state: 'visible' });
    await existing.getByRole('button', { name: 'Удалить', exact: true }).click(); await existing.waitFor({ state: 'hidden' });
  }
  await page.getByRole('button', { name: 'Добавить устройство', exact: true }).click();
  const settings = page.locator('#device-modal');
  await settings.getByLabel('Название', { exact: true }).fill('Ручной вход');
  await settings.getByLabel('IP-адрес', { exact: true }).fill('127.0.0.1');
  await settings.getByLabel('Порт XMEye', { exact: true }).fill('19429');
  if (await settings.getByLabel('Название', { exact: true }).inputValue() !== 'Ручной вход' || await settings.getByLabel('Порт XMEye', { exact: true }).inputValue() !== '19429') throw new Error('Unexpected form values');
  await settings.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await settings.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Подключить', exact: true }).click();
  const login = page.locator('#login-modal');
  await login.waitFor({ state: 'visible' });
  await login.getByLabel('Пользователь', { exact: true }).fill('test-first');
  await login.getByLabel('Пароль', { exact: true }).fill('wrong-fixture-value');
  await login.getByRole('button', { name: 'Подключить', exact: true }).click();
  await page.getByText('Неверный пароль', { exact: true }).waitFor();
  if (await login.getByLabel('Пользователь', { exact: true }).inputValue() !== 'test-first') throw new Error('Username lost after login error');
  await login.getByLabel('Пароль', { exact: true }).fill('first-fixture-only');
  await login.getByRole('button', { name: 'Подключить', exact: true }).click();
  await login.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Подключено', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Ручной вход 127.0.0.1', exact: true }).click();
  await page.getByRole('heading', { name: 'Ручной вход', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Подключить', exact: true }).click();
  await page.getByRole('button', { name: 'Подключено', exact: true }).waitFor();
  if (await login.isVisible()) throw new Error('Successful manual login was not remembered');
  await page.getByRole('button', { name: 'Настройки устройства', exact: true }).click();
  await settings.waitFor({ state: 'visible' });
  if (await settings.getByLabel('Пользователь', { exact: true }).inputValue() !== 'test-first') throw new Error('Remembered username missing in settings');
  if (await settings.getByLabel('Пароль', { exact: true }).inputValue()) throw new Error('Secret returned to password field');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: 'output/playwright/settings-v0.2.png', scale: 'css' });
  await settings.getByRole('button', { name: 'Удалить', exact: true }).click();
  await settings.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  return { incorrectPasswordHandled: true, usernameRetainedAfterError: true, successfulLoginRememberedAfterReload: true, savedCredentialsShownInSettings: true, passwordNotReturnedToBrowser: true };
}
