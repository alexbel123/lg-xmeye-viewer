'use strict';
(function(){
  class LiveGrid{
    constructor(api,changed){this.api=api;this.changed=changed;this.records=new Map();this.generation=0;this.queue=Promise.resolve();}
    async release(record){
      if(this.records.get(record.id)===record)this.records.delete(record.id);
      record.player.dispose();
      record.canvas.remove();
      if(record.lease)await this.api.call('stop',{slot:record.slot,lease:record.lease}).catch(()=>{});
    }
    sync(profileId,cameras){
      const generation=++this.generation;
      this.queue=this.queue.catch(()=>{}).then(async()=>{
        if(generation!==this.generation)return;
        const wanted=new Set(cameras.map(camera=>camera.id));
        await Promise.all([...this.records.values()].filter(record=>record.profileId!==profileId||!wanted.has(record.id)).map(record=>this.release(record)));
        if(generation!==this.generation)return;
        await Promise.all(cameras.filter(camera=>!this.records.has(camera.id)).map(async camera=>{
          const record={id:camera.id,profileId,slot:'grid-'+camera.channel,lease:null,phase:'loading',error:null,canvas:document.createElement('canvas')};
          record.canvas.setAttribute('aria-label',camera.name);
          const alive=()=>this.records.get(record.id)===record;
          const change=()=>{if(alive())this.changed(record);};
          record.player=new LocalSoftwarePlayer(record.canvas,{
            metadata:metadata=>{Object.assign(record,{codec:metadata.codec,width:metadata.width,height:metadata.height});record.canvas.dataset.codec=metadata.codec;change();},
            state:phase=>{if(alive()&&record.phase!==phase){record.phase=phase;if(phase==='ended')record.error='Трансляция завершена';change();}},
            error:message=>{if(!alive())return;record.phase='error';record.error=message;change();if(record.lease)this.api.call('stop',{slot:record.slot,lease:record.lease}).catch(()=>{});}
          });
          this.records.set(camera.id,record);change();
          try{
            const source=await this.api.call('live',{id:profileId,channel:camera.channel,quality:'Extra1',slot:record.slot,software:true});record.lease=source.lease;
            if(generation!==this.generation||!alive()){await this.release(record);return;}
            record.player.start(source.url);
          }catch(error){if(alive()){record.phase='error';record.error=error.message;change();}}
        }));
      });
      return this.queue;
    }
    async retry(id){const record=this.records.get(id);if(record)await this.release(record);}
    async clear(){++this.generation;await this.queue.catch(()=>{});await Promise.all([...this.records.values()].map(record=>this.release(record)));}
  }
  window.LiveGrid=LiveGrid;
})();
