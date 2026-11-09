'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs').promises;
const os=require('os');
const path=require('path');
const {SettingsStore}=require('../src/settings.cjs');
const profile={id:'fixture',title:'Стенд',host:'127.0.0.1',port:19459,channelCount:12,favorites:[]};
test('service settings survive restart and retain ordered per-recorder sets without credentials',async context=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'viewer-settings-'));context.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const store=new SettingsStore(directory);assert.equal(await store.get(),null);
  const workspace={schema:1,labels:true,remember:true,activeDevice:'fixture',devices:[{id:'fixture',activeId:'perimeter',sets:[{id:'perimeter',name:'Периметр',layout:4,cameraIds:[1,3,5,7]}]}]};
  await store.set({profiles:[{...profile,password:'must-be-discarded',hash:'must-be-discarded',username:'must-be-discarded'}],workspace:{...workspace,password:'must-be-discarded'}});
  const restored=await new SettingsStore(directory).get();assert.deepEqual(restored,{schema:1,profiles:[profile],workspace});assert.doesNotMatch(await fs.readFile(store.file,'utf8'),/password|hash|username|must-be-discarded/);
  await Promise.all([store.set({profiles:[profile],workspace:null}),store.set({profiles:[],workspace:null})]);assert.deepEqual((await store.get()).profiles,[]);
});
test('invalid settings cannot overwrite existing data and corrupt snapshots permit first run',async context=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'viewer-settings-'));context.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const store=new SettingsStore(directory);await store.set({profiles:[profile]});assert.throws(()=>store.set({profiles:[{...profile,port:0}]}),/регистратор/);assert.deepEqual((await store.get()).profiles,[profile]);
  await fs.writeFile(store.file,'{bad json');assert.equal(await store.get(),null);await fs.writeFile(store.file,'{"profiles":false}');assert.equal(await store.get(),null);
});
