'use strict';
let decoder, module, width=0, height=0, timestamp=0;
let serial=Promise.resolve();
async function initialize(codec) {
  let simd=false;
  try { simd=WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])); } catch (_) {}
  const name=simd?'videodec_simd':'videodec';
  importScripts('vendor/decoder/'+name+'.js');
  const bytes=await new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest(); request.open('GET','vendor/decoder/'+name+'.wasm');request.responseType='arraybuffer';
    request.onload=()=>request.response?resolve(request.response):reject(new Error('Декодер не загружен'));request.onerror=()=>reject(new Error('Декодер не загружен'));request.send();
  });
  module=await self.createVideoDecoder({wasmBinary:bytes,print:()=>{},printErr:()=>{}});
  decoder=new module.VideoDecoder({
    videoInfo(w,h){width=w;height=h;postMessage({type:'metadata',width,height,codec});},
    yuvData(array,pts){
      const size=width*height, chroma=Math.ceil(width/2)*Math.ceil(height/2), data=new Uint8Array(size+chroma*2), pointers=array>>2;
      data.set(module.HEAPU8.subarray(module.HEAPU32[pointers],module.HEAPU32[pointers]+size));
      data.set(module.HEAPU8.subarray(module.HEAPU32[pointers+1],module.HEAPU32[pointers+1]+chroma),size);
      data.set(module.HEAPU8.subarray(module.HEAPU32[pointers+2],module.HEAPU32[pointers+2]+chroma),size+chroma);
      postMessage({type:'frame',width,height,data,pts},[data.buffer]);
    },
    errorInfo(message){postMessage({type:'error',message:'Ошибка программного декодера: '+message});}
  });
  decoder.setCodec(codec==='h265'?'hevc':'avc','annexb','');
  postMessage({type:'ready'});
}
self.onmessage=event=>{
  const message=event.data;
  serial=serial.then(async()=>{
    if(message.type==='init') await initialize(message.codec);
    else if(message.type==='packet') { decoder.decode(message.data,message.key?1:0,timestamp++);postMessage({type:'ack'}); }
  }).catch(error=>postMessage({type:'error',message:error.message||'Программный декодер недоступен'}));
};
