'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const localBinary = path.join(__dirname, 'ffmpeg-runtime/ffmpeg.exe');
const binary = process.env.FFMPEG || (fs.existsSync(localBinary) ? localBinary : 'ffmpeg');
fs.mkdirSync(path.join(root, 'test/fixtures'), { recursive: true });
for (const mode of ['normal', 'bframes']) for (const codec of ['h264', 'h265']) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=12', '-t', '6', '-an', '-pix_fmt', 'yuv420p'];
  if (codec === 'h264') args.push('-c:v', 'libx264', '-profile:v', mode === 'normal' ? 'baseline' : 'main', '-bf', mode === 'normal' ? '0' : '2', '-x264-params', 'aud=1:keyint=12:min-keyint=12:scenecut=0');
  else args.push('-c:v', 'libx265', '-x265-params', 'aud=1:keyint=12:min-keyint=12:scenecut=0:bframes=' + (mode === 'normal' ? '0' : '2') + ':pools=1:frame-threads=1:log-level=error');
  args.push('-f', codec === 'h264' ? 'h264' : 'hevc', path.join(root, 'test/fixtures/video' + (mode === 'normal' ? '' : '-b') + '.' + codec));
  execFileSync(binary, args, { stdio: 'inherit' });
}
console.log('Generated synthetic H.264 and H.265 fixtures');
