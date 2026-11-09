async page => {
  await page.getByRole('button', { name: '01 Тестовая камера 1', exact: true }).click();
  await page.waitForFunction(() => { const video = document.getElementById('video'); return video.readyState >= 2 && video.currentTime > 1; }, { timeout: 15000 });
  const video = await page.locator('#video').evaluate(element => ({ width: element.videoWidth, height: element.videoHeight, currentTime: element.currentTime, error: element.error?.code || null }));
  if (video.width !== 640 || video.height !== 360 || video.error) throw new Error('Video did not decode');
  return { decodedVideo: video, controls: await page.locator('#player-controls').ariaSnapshot() };
}
