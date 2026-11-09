'use strict';
let module, width=0, height=0, timestamp=0;
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
  module.onFrame=(w,h,y,ys,u,us,v,vs,pts)=>{
    if(w!==width||h!==height){width=w;height=h;postMessage({type:'metadata',width,height,codec});}
    const size=width*height,cw=Math.ceil(width/2),ch=Math.ceil(height/2),chroma=cw*ch,data=new Uint8Array(size+chroma*2);
    for(const [pointer,stride,rows,columns,offset] of [[y,ys,height,width,0],[u,us,ch,cw,size],[v,vs,ch,cw,size+chroma]]){
      for(let row=0;row<rows;row++)data.set(module.HEAPU8.subarray(pointer+row*stride,pointer+row*stride+columns),offset+row*columns);
    }
    postMessage({type:'frame',width,height,data,pts},[data.buffer]);
  };
  if(module._viewer_create(codec==='h265'?265:264)<0)throw new Error(module.UTF8ToString(module._viewer_error()));
  postMessage({type:'ready'});
}
self.onmessage=event=>{
  const message=event.data;
  serial=serial.then(async()=>{
    if(message.type==='init') await initialize(message.codec);
    else if(message.type==='packet') {
      if(!module)throw new Error('Декодер не инициализирован');
      const pointer=module._malloc(message.data.length);
      if(!pointer)throw new Error('Недостаточно памяти для видеокадра');
      try{
        module.HEAPU8.set(message.data,pointer);
        if(module._viewer_decode(pointer,message.data.length,message.key?1:0,timestamp++)<0)throw new Error(module.UTF8ToString(module._viewer_error()));
      }finally{module._free(pointer);}
      postMessage({type:'ack'});
    }else if(message.type==='flush'){
      if(module&&module._viewer_flush()<0)throw new Error(module.UTF8ToString(module._viewer_error()));
      postMessage({type:'flushed'});
    }
  }).catch(error=>postMessage({type:'error',message:error.message||'Программный декодер недоступен'}));
};
