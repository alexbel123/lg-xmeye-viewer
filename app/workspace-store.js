'use strict';
(function(root){
  const layouts=[1,2,4,6],key='viewer.workspace.v1';
  const ids=values=>[...new Set((Array.isArray(values)?values:[]).filter(value=>Number.isInteger(value)&&value>=1&&value<=256))];
  class WorkspaceStore{
    constructor(storage){
      this.storage=storage;this.devices=new Map();this.preferences={labels:true,remember:true,activeDevice:null};
      try{
        const saved=JSON.parse(storage.getItem(key)||'null');
        if(saved?.schema!==1)return;
        this.preferences.labels=saved.labels!==false;this.preferences.remember=saved.remember!==false;
        this.preferences.activeDevice=typeof saved.activeDevice==='string'?saved.activeDevice:null;
        for(const entry of Array.isArray(saved.devices)?saved.devices:[]){
          if(!entry||typeof entry.id!=='string')continue;
          const seen=new Set(),sets=[];
          for(const item of Array.isArray(entry.sets)?entry.sets:[]){
            if(!item||typeof item.id!=='string'||seen.has(item.id)||typeof item.name!=='string'||!item.name.trim())continue;
            const cameraIds=ids(item.cameraIds);if(!cameraIds.length)continue;
            sets.push({id:item.id,name:item.name.trim().slice(0,36),cameraIds,layout:layouts.includes(item.layout)?item.layout:6});seen.add(item.id);
          }
          if(sets.length)this.devices.set(entry.id,{sets,activeId:this.preferences.remember&&sets.some(item=>item.id===entry.activeId)?entry.activeId:sets[0].id});
        }
      }catch(_){}
    }
    ensure(deviceId,cameraIds,favorites=[]){
      let view=this.devices.get(deviceId);
      if(!view){
        const available=new Set(ids(cameraIds)),preferred=ids(favorites).filter(id=>available.has(id));
        const selected=preferred.length?preferred:ids(cameraIds).slice(0,6);
        if(!selected.length)return null;
        view={sets:[{id:'default',name:preferred.length?'Избранное':'Основной набор',cameraIds:selected,layout:6}],activeId:'default'};
        this.devices.set(deviceId,view);
      }
      return view;
    }
    view(deviceId){return this.devices.get(deviceId)||null;}
    current(deviceId){const view=this.view(deviceId);return view?.sets.find(item=>item.id===view.activeId)||view?.sets[0]||null;}
    activate(deviceId,setId){const view=this.view(deviceId);if(!view?.sets.some(item=>item.id===setId))throw new Error('Набор не найден');view.activeId=setId;this.save();}
    layout(deviceId,count){if(!layouts.includes(count))throw new Error('Выберите сетку 1, 2, 4 или 6');const set=this.current(deviceId);if(!set)throw new Error('Выберите набор');set.layout=count;this.save();}
    put(deviceId,draft){
      const view=this.view(deviceId);if(!view)throw new Error('Подключите регистратор');
      const name=String(draft.name||'').trim(),cameraIds=ids(draft.cameraIds);
      if(!name)throw new Error('Введите название набора');if(name.length>36)throw new Error('Название не длиннее 36 символов');
      if(!cameraIds.length)throw new Error('Выберите хотя бы одну камеру');if(!layouts.includes(draft.layout))throw new Error('Выберите размер сетки');
      const set={id:draft.id||'set-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name,cameraIds,layout:draft.layout};
      const index=view.sets.findIndex(item=>item.id===set.id);if(index<0)view.sets.push(set);else view.sets[index]=set;
      view.activeId=set.id;this.save();return set;
    }
    remove(deviceId,setId){
      const view=this.view(deviceId);if(!view||view.sets.length<=1)throw new Error('Должен остаться хотя бы один набор');
      view.sets=view.sets.filter(item=>item.id!==setId);if(view.activeId===setId)view.activeId=view.sets[0].id;this.save();
    }
    page(deviceId,page=0){const set=this.current(deviceId);if(!set)return [];const offset=Math.max(0,page)*set.layout;return set.cameraIds.slice(offset,offset+set.layout);}
    save(){
      try{this.storage.setItem(key,JSON.stringify({schema:1,...this.preferences,devices:[...this.devices].map(([id,view])=>({id,...view}))}));}
      catch(_){throw new Error('Не удалось сохранить настройки на устройстве');}
    }
  }
  if(typeof module==='object'&&module.exports)module.exports={WorkspaceStore};else root.WorkspaceStore=WorkspaceStore;
})(typeof window==='object'?window:globalThis);
