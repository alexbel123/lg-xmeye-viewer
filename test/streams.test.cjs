'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {ViewerManager} = require('../src/manager.cjs');
const {createFixtureRecorder} = require('./fixture-recorder.cjs');

async function setup(t, options={}) {
  const fixture=await createFixtureRecorder({filename:path.join(__dirname,'fixtures/video.'+(options.codec||'h264')),...options});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'viewer-streams-test-'));
  const manager=new ViewerManager({credentialsDirectory:directory}), controllers=[];
  t.after(async()=>{
    controllers.forEach(controller=>controller.abort()); await manager.close(); await fixture.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));
    assert.ok(path.basename(directory).startsWith('viewer-streams-test-'));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  await manager.connect({id:'fixture',host:'127.0.0.1',port:fixture.port,username:fixture.username,password:fixture.password,remember:false});
  async function open(channel,slot='main',software=false) {
    const result=await manager.live({id:'fixture',channel,slot,software});
    const controller=new AbortController();controllers.push(controller);
    const response=await fetch(result.url,{signal:controller.signal});
    assert.equal(response.status,200);
    const reader=response.body.getReader();let buffer=Buffer.alloc(0);
    async function next() {
      for(;;) {
        if(buffer.length>=5 && buffer.length>=5+buffer.readUInt32BE(1)) {
          const size=buffer.readUInt32BE(1),kind=buffer[0],data=buffer.subarray(5,5+size);buffer=buffer.subarray(5+size);return {kind,data};
        }
        const result=await reader.read();assert.equal(result.done,false,'stream ended early');buffer=Buffer.concat([buffer,Buffer.from(result.value)]);
      }
    }
    return {...result,controller,next};
  }
  return {manager,fixture,open};
}

test('rapid camera changes cancel an unfinished Claim without closing the control session',async t=>{
  const {manager,fixture,open}=await setup(t,{claimDelay:120,rejectReclaim:true,closeOnStop:true,aliveInterval:1});
  for(let index=0;index<6;index++) {
    const old=await open(index%4);old.controller.abort();
    const current=await open((index+1)%4);
    assert.equal((await current.next()).kind,1);
    assert.equal((await current.next()).kind,2);
    await manager.stop({slot:'main',lease:old.lease});
    assert.equal((await current.next()).kind,2,'late cleanup stopped the replacement stream');
    assert.equal(manager.status().devices[0].connected,true);
  }
  assert.equal((await manager._device('fixture').client.systemInfo()).VideoInChannel,4);
  const control=fixture.requests.find(request=>request.command===1020).connection;
  assert.ok(!fixture.requests.some(request=>request.connection===control && request.command===1413));
  assert.ok(!fixture.requests.some(request=>request.action==='Stop'));
});

test('six streams are independent; a seventh is rejected and a failed camera preserves peers',async t=>{
  const {manager,open}=await setup(t,{channelCount:8,rejectReclaim:true,closeOnStop:true,failChannels:[2]});
  assert.equal((await manager.bootstrap()).maxStreams,6);
  const sources=[];for(let channel=0;channel<6;channel++) sources.push(await manager.live({id:'fixture',channel,slot:'grid-'+channel}));
  await assert.rejects(manager.live({id:'fixture',channel:6,slot:'seventh'}),/шести/);
  // Replace the unconsumed reservations with actual streams, including one failure.
  const streams=[];for(let channel=0;channel<6;channel++) streams.push(await open(channel,'grid-'+channel));
  for(const channel of [0,1,3,4,5]) assert.equal((await streams[channel].next()).kind,1);
  assert.equal((await streams[2].next()).kind,3);
  await manager.stop({slot:'grid-0',lease:streams[0].lease});
  for(const channel of [1,3,4,5]) assert.equal((await streams[channel].next()).kind,2);
  const replacement=await open(6,'grid-6');
  assert.equal((await replacement.next()).kind,1);
  const archive=await manager.archive({id:'fixture',channel:0,begin:'2026-11-04 00:00:00',end:'2026-11-04 23:59:59'});
  assert.equal(archive.files.length,1);assert.equal(manager.status().devices[0].connected,true);
  assert.deepEqual(manager.status().streams.map(stream=>stream.slot).sort(),['grid-1','grid-3','grid-4','grid-5','grid-6']);
});

test('replacing an unused URL invalidates its token and a stale stop cannot cancel a new lease',async t=>{
  const {manager}=await setup(t);
  const first=await manager.live({id:'fixture',channel:0});
  const second=await manager.live({id:'fixture',channel:1});
  await manager.stop({slot:'main',lease:first.lease});
  assert.equal((await fetch(first.url)).status,404);
  assert.equal(manager.status().streams[0].channel,1);
  await manager.stop({slot:'main',lease:second.lease});
  assert.equal((await fetch(second.url)).status,404);
  assert.equal(manager.status().devices[0].connected,true);
});

test('software decoding receives an HEVC Annex-B keyframe independently of the hardware muxer',async t=>{
  const {manager,open}=await setup(t,{codec:'h265'});
  const stream=await open(0,'grid-0',true), metadata=await stream.next();
  assert.equal(metadata.kind,1);assert.equal(JSON.parse(metadata.data).format,'annexb');assert.equal(JSON.parse(metadata.data).codec,'h265');
  const frame=await stream.next();assert.equal(frame.kind,5);assert.equal(frame.data[0],1);assert.ok(frame.data.subarray(1,5).equals(Buffer.from([0,0,0,1])));
  assert.equal(manager.status().devices[0].connected,true);
});
