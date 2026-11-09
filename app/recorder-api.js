'use strict';
(function(){
  class RecorderAPI{
    constructor(){this.native=Boolean(window.PalmServiceBridge);this.bridges=new Set();this.session=null;}
    call(method,parameters={}){
      if(!this.native)return fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json','X-Viewer-Client':'1'},body:JSON.stringify(parameters)}).then(async response=>{
        const result=await response.json();if(!response.ok||result.returnValue===false)throw new Error(result.errorText||'Не удалось выполнить запрос');return result;
      });
      return new Promise((resolve,reject)=>{
        const bridge=new PalmServiceBridge();this.bridges.add(bridge);
        const timer=setTimeout(()=>{this.bridges.delete(bridge);bridge.cancel?.();reject(new Error('Сервис телевизора не ответил. Переоткройте приложение'));},40000);
        bridge.onservicecallback=raw=>{
          clearTimeout(timer);this.bridges.delete(bridge);
          try{const result=JSON.parse(raw);if(result.returnValue===false)reject(new Error(result.errorText||'Ошибка сервиса LG'));else resolve(result);}
          catch(_){reject(new Error('Не удалось прочитать ответ сервиса LG'));}
        };
        bridge.call('luna://local.xmeye.viewer.service/'+method,JSON.stringify(parameters));
      });
    }
    hold(){if(this.native&&!this.session){this.session=new PalmServiceBridge();this.session.onservicecallback=()=>{};this.session.call('luna://local.xmeye.viewer.service/session','{"subscribe":true}');}}
    close(){this.session?.cancel?.();this.session=null;for(const bridge of this.bridges)bridge.cancel?.();this.bridges.clear();}
  }
  window.RecorderAPI=RecorderAPI;
})();
