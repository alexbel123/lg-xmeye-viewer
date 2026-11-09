async page => {
  const modal = page.locator('#login-modal');
  await modal.getByLabel('Пользователь', { exact: true }).fill('test-viewer');
  await modal.getByLabel('Пароль', { exact: true }).fill('intentionally-wrong-fixture-value');
  await modal.getByRole('button', { name: 'Подключить', exact: true }).click();
  await page.getByText('Неверный пароль', { exact: true }).waitFor();
  await modal.getByLabel('Пароль', { exact: true }).fill('synthetic-fixture-only');
  await modal.getByRole('button', { name: 'Подключить', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Подключено', exact: true }).waitFor();
  const count = await page.locator('.channel-select').count();
  if (count !== 4) throw new Error('Expected four fixture channels, got ' + count);
  const stored = await page.evaluate(() => localStorage.getItem('viewer.profiles'));
  if (/synthetic-fixture-only|intentionally-wrong|password|PassWord/.test(stored)) throw new Error('Password leaked to profile storage');
  return { wrongPasswordHandled: true, connectionSucceeded: true, channels: count, noPasswordInStorage: true, channelsSnapshot: await page.locator('#channels').ariaSnapshot() };
}
