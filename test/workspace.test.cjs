'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {WorkspaceStore}=require('../app/workspace-store.js');
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};
test('layouts page a named selection without losing its order after reload',()=>{
  const storage=memory(),store=new WorkspaceStore(storage);store.ensure('recorder-a',[1,2,3,4,5,6,7,8,9]);
  store.put('recorder-a',{name:'Периметр',cameraIds:[1,3,5,7,9,2,4],layout:6});
  for(const layout of [1,2,4,6]){store.layout('recorder-a',layout);assert.deepEqual(store.page('recorder-a'),[1,3,5,7,9,2,4].slice(0,layout));assert.deepEqual(store.current('recorder-a').cameraIds,[1,3,5,7,9,2,4]);}
  assert.deepEqual(store.page('recorder-a',1),[4]);assert.deepEqual(new WorkspaceStore(storage).current('recorder-a'),store.current('recorder-a'));
});
test('recorder workspaces, copies and deletion remain independent',()=>{
  const store=new WorkspaceStore(memory());for(const id of ['a','b'])store.ensure(id,[1,2,3,4,5,6,7,8,9]);
  const first=store.put('a',{name:'Вход',cameraIds:[1,3,5,7,7],layout:4});
  const second=store.put('a',{name:'Двор',cameraIds:[3,5,8,9],layout:4});
  store.activate('a',first.id);assert.deepEqual(store.current('a').cameraIds,[1,3,5,7]);assert.deepEqual(store.current('b').cameraIds,[1,2,3,4,5,6]);
  store.remove('a',first.id);assert.equal(store.current('a').id,'default');store.remove('a',second.id);assert.throws(()=>store.remove('a','default'),/хотя бы один/);
});
test('corrupt saved data is ignored and invalid drafts cannot replace a set',()=>{
  const storage=memory();storage.setItem('viewer.workspace.v1','{broken');const store=new WorkspaceStore(storage);store.ensure('a',[1,2,3],[3,99,3]);assert.deepEqual(store.current('a').cameraIds,[3]);
  assert.throws(()=>store.put('a',{name:'',cameraIds:[1],layout:6}),/название/);assert.throws(()=>store.put('a',{name:'Тест',cameraIds:[],layout:6}),/камеру/);assert.throws(()=>store.layout('a',8),/1, 2, 4 или 6/);assert.deepEqual(store.current('a').cameraIds,[3]);
});
