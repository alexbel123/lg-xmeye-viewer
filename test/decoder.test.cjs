'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {accessUnits}=require('./fixture-recorder.cjs');
const root=path.resolve(__dirname,'..');
const decoderDirectory=process.env.VIEWER_TEST_DECODER_DIR||path.join(root,'app/vendor/decoder');
const localFFmpeg=path.join(root,'tools/ffmpeg-runtime/ffmpeg.exe');
const ffmpeg=process.env.FFMPEG||(fs.existsSync(localFFmpeg)?localFFmpeg:'ffmpeg');
const reference=new Map();
function packets(codec,bframes=false){
  const filename=path.join(__dirname,'fixtures/video'+(bframes?'-b':'')+'.'+codec);
  return {filename,units:accessUnits(filename,codec).map(wire=>({key:wire[3]===0xfc,data:wire.subarray(wire[3]===0xfc?16:8)}))};
}
async function create(variant,codec){
  const name=variant==='simd'?'videodec_simd':'videodec';
  const factory=require(path.join(decoderDirectory,name+'.js'));
  const module=await factory({wasmBinary:fs.readFileSync(path.join(decoderDirectory,name+'.wasm')),print:()=>{},printErr:()=>{}});
  const frames=[];
  module.onFrame=(width,height,y,ys,u,us,v,vs)=>{
    const cw=Math.ceil(width/2),ch=Math.ceil(height/2),size=width*height,chroma=cw*ch,data=Buffer.alloc(size+2*chroma);
    for(const [pointer,stride,rows,columns,offset] of [[y,ys,height,width,0],[u,us,ch,cw,size],[v,vs,ch,cw,size+chroma]]){
      for(let row=0;row<rows;row++)data.set(module.HEAPU8.subarray(pointer+row*stride,pointer+row*stride+columns),offset+row*columns);
    }
    frames.push({width,height,data});
  };
  assert.equal(module._viewer_create(codec==='h265'?265:264),0);
  return {module,frames,push(unit,pts){
    const pointer=module._malloc(unit.data.length);assert.ok(pointer);
    try{
      module.HEAPU8.set(unit.data,pointer);
      const status=module._viewer_decode(pointer,unit.data.length,Number(unit.key),pts);
      assert.equal(status,0,module.UTF8ToString(module._viewer_error()));
    }finally{module._free(pointer);}
  },flush(){assert.equal(module._viewer_flush(),0,module.UTF8ToString(module._viewer_error()));},close(){module._viewer_destroy();}};
}
function expected(filename){
  if(!reference.has(filename))reference.set(filename,execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-i',filename,'-fps_mode','passthrough','-pix_fmt','yuv420p','-f','rawvideo','pipe:1'],{maxBuffer:64*1024*1024}));
  return reference.get(filename);
}
function hash(data){return crypto.createHash('sha256').update(data).digest('hex');}
for(const variant of ['scalar','simd'])for(const codec of ['h264','h265'])for(const bframes of [false,true]){
  test(`${variant} ${codec}${bframes?' B-frames':''}: decoded pixels match native FFmpeg`,async()=>{
    const input=packets(codec,bframes),decoder=await create(variant,codec);
    try{
      input.units.forEach((unit,index)=>decoder.push(unit,index));decoder.flush();
      assert.equal(decoder.frames.length,72);
      assert.ok(decoder.frames.every(frame=>frame.width===640&&frame.height===360));
      assert.equal(hash(Buffer.concat(decoder.frames.map(frame=>frame.data))),hash(expected(input.filename)));
      assert.ok(decoder.module.HEAPU8.byteLength<=256*1024*1024);
      decoder.flush();
    }finally{decoder.close();}
  });
}
test('six decoder instances preserve independent H.264/H.265 state',async()=>{
  const codecs=['h264','h265','h264','h265','h264','h265'],inputs=codecs.map(codec=>packets(codec));
  const decoders=await Promise.all(codecs.map(codec=>create('simd',codec)));
  try{
    for(let i=0;i<72;i++)for(let slot=0;slot<codecs.length;slot++)decoders[slot].push(inputs[slot].units[i],i);
    decoders.forEach(decoder=>decoder.flush());
    for(let slot=0;slot<codecs.length;slot++)assert.equal(hash(Buffer.concat(decoders[slot].frames.map(frame=>frame.data))),hash(expected(inputs[slot].filename)));
  }finally{decoders.forEach(decoder=>decoder.close());}
});
test('decoder rejects invalid state and supports codec reinitialization',async()=>{
  const decoder=await create('scalar','h264');
  try{
    assert.ok(decoder.module._viewer_decode(0,1,0,0)<0);
    assert.match(decoder.module.UTF8ToString(decoder.module._viewer_error()),/invalid packet/);
    assert.ok(decoder.module._viewer_create(999)<0);
    assert.equal(decoder.module._viewer_create(265),0);
    packets('h265').units.forEach((unit,index)=>decoder.push(unit,index));decoder.flush();
    assert.equal(decoder.frames.length,72);
  }finally{decoder.close();}
});
