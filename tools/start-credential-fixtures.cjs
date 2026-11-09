'use strict';
const path = require('path');
const { createFixtureRecorder } = require('../test/fixture-recorder.cjs');
const filename = path.join(__dirname, '../test/fixtures/video.h264');
Promise.all([
  createFixtureRecorder({ filename, port: 19429, username: 'test-first', password: 'first-fixture-only' }),
  createFixtureRecorder({ filename, port: 19430, username: 'test-second', password: 'second-fixture-only' })
]).then(fixtures => {
  console.log('Two synthetic recorder accounts ready on localhost:19429 and :19430');
  const close = () => Promise.all(fixtures.map(fixture => fixture.close())).finally(() => process.exit(0));
  process.on('SIGINT', close); process.on('SIGTERM', close);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
