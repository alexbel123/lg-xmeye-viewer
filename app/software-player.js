'use strict';
(function(){
  function renderer(canvas) {
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:false});
    if(!gl) throw new Error('Графический вывод камер недоступен');
    function shader(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Ошибка графического вывода');return shader;}
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 t;void main(){gl_Position=vec4(p,0.,1.);t=vec2((p.x+1.)*.5,(1.-p.y)*.5);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 t;uniform sampler2D y;uniform sampler2D u;uniform sampler2D v;void main(){float a=1.1643*(texture2D(y,t).r-.0625);float b=texture2D(u,t).r-.5;float c=texture2D(v,t).r-.5;gl_FragColor=vec4(a+1.5958*c,a-.39173*b-.81290*c,a+2.017*b,1.);}'));
    gl.linkProgram(program);gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    const textures=['y','u','v'].map((name,index)=>{gl.activeTexture(gl.TEXTURE0+index);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,name),index);return texture;});
    const draw=frame=>{
      if(canvas.width!==frame.width||canvas.height!==frame.height){canvas.width=frame.width;canvas.height=frame.height;gl.viewport(0,0,frame.width,frame.height);}
      const size=frame.width*frame.height,cw=Math.ceil(frame.width/2),ch=Math.ceil(frame.height/2),chroma=cw*ch;
      const planes=[frame.data.subarray(0,size),frame.data.subarray(size,size+chroma),frame.data.subarray(size+chroma)];
      textures.forEach((texture,index)=>{gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,index?cw:frame.width,index?ch:frame.height,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,planes[index]);});
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    };
    return {draw,close(){textures.forEach(texture=>gl.deleteTexture(texture));gl.deleteBuffer(buffer);gl.deleteProgram(program);const extension=gl.getExtension('WEBGL_lose_context');if(extension)extension.loseContext();}};
  }
  class LocalSoftwarePlayer {
    constructor(canvas,callbacks){this.canvas=canvas;this.callbacks=callbacks;this.generation=0;this.controller=null;this.worker=null;this.pending=0;this.frames=0;this.draw=null;this.flushResolve=null;}
    async start(url){
      this.stop();const generation=++this.generation;this.controller=new AbortController();this.callbacks.state('loading');
      const fail=error=>{if(generation!==this.generation)return;this.stop();this.callbacks.error(error.message||String(error));};
      try {
        if(!this.draw)this.draw=renderer(this.canvas);
        const response=await fetch(url,{signal:this.controller.signal,cache:'no-store'});if(!response.ok||!response.body)throw new Error('Не удалось открыть видео');
        const reader=response.body.getReader();let buffer=new Uint8Array(0),ended=false;
        while(generation===this.generation){
          const result=await reader.read();if(result.done)break;if(generation!==this.generation)return;
          const joined=new Uint8Array(buffer.length+result.value.length);joined.set(buffer);joined.set(result.value,buffer.length);buffer=joined;
          while(buffer.length>=5){
            const size=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength).getUint32(1);if(size>16*1024*1024)throw new Error('Слишком большой видеокадр');if(buffer.length<size+5)break;
            const kind=buffer[0],data=buffer.slice(5,size+5);buffer=buffer.slice(size+5);
            if(kind===1){
              const meta=JSON.parse(new TextDecoder().decode(data));this.worker=new Worker('decoder-worker.js');
              await new Promise((resolve,reject)=>{
                this.worker.onerror=()=>reject(new Error('Не удалось загрузить программный декодер'));
                this.worker.onmessage=event=>{if(generation!==this.generation)return;const frame=event.data;
                  if(frame.type==='ready')resolve();
                  else if(frame.type==='metadata')this.callbacks.metadata(frame);
                  else if(frame.type==='ack')this.pending=Math.max(0,this.pending-1);
                  else if(frame.type==='flushed'){if(this.flushResolve)this.flushResolve();this.flushResolve=null;}
                  else if(frame.type==='error'){const error=new Error(frame.message);reject(error);fail(error);}
                  else if(frame.type==='frame'){this.draw.draw(frame);this.canvas.dataset.frames=String(++this.frames);this.callbacks.state('playing');}
                };
                this.worker.postMessage({type:'init',codec:meta.codec});
              });
            } else if(kind===5){
              while(this.pending>=3&&generation===this.generation)await new Promise(resolve=>setTimeout(resolve,8));
              if(generation!==this.generation)return;const bytes=data.slice(1);this.pending++;this.worker.postMessage({type:'packet',key:!!data[0],data:bytes},[bytes.buffer]);
            } else if(kind===3)throw new Error(new TextDecoder().decode(data));
            else if(kind===4){
              if(this.worker)await new Promise(resolve=>{this.flushResolve=resolve;this.worker.postMessage({type:'flush'});});
              if(generation!==this.generation)return;
              ended=true;this.callbacks.state('ended');
            }
          }
        }
        if(!ended&&generation===this.generation)throw new Error('Видеопоток прерван');
      } catch(error){if(error.name!=='AbortError')fail(error);}
    }
    stop(){this.generation++;if(this.controller)this.controller.abort();if(this.worker)this.worker.terminate();if(this.flushResolve)this.flushResolve();this.flushResolve=null;this.controller=null;this.worker=null;this.pending=0;this.frames=0;this.canvas.dataset.frames='0';}
    dispose(){this.stop();if(this.draw)this.draw.close();this.draw=null;}
  }
  window.LocalSoftwarePlayer=LocalSoftwarePlayer;
})();
