import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {gameConfig,publishGamePackage} from './game-api.mjs';
const mini={question:'Which?',options:['A','B','C'],answer:'A',explanation:'Because A'};
const visual={image_url:'https://images.example.com/a.jpg',teaching_text:'Learn',key_idea:'Idea',nova_script:'Hello',mini_question:mini};
const q={...mini,options:['A','B','C','D'],image_url:visual.image_url,nova_script:'Try',hints:['a','b','c'],difficulty:'Easy',xp:10,marks:1};
function fixture(){return {curriculum:{grade:'Grade 1',board:'CBSE',subject:'Computer',topic:'Keyboard'},concept:{name:'Keyboard keys',learning_objective:'Use keys'},content_type:'concept_package',learning_content:{...visual,teaching_method:'Practice',explanation:'Keys'},learn_before_test:{required:true,order:['understand','example','remember'],starts_quiz_after:'remember',steps:['understand','example','remember'].map(step_key=>({...visual,step_key,...(step_key==='example'?{explanation_ways:[visual,visual]}:{})}))},check_for_understanding:[q],test_questions:{questions:[q]},battle_questions:[q],challenge:{questions:[q]}};}
const env={GAME_API_URL:'https://game.example.com/ingest',GAME_API_TOKEN:'secret'};
test('configuration enforces secure destinations',()=>{assert.throws(()=>gameConfig({}));assert.throws(()=>gameConfig({GAME_API_URL:'http://example.com'}));assert.throws(()=>gameConfig({GAME_API_URL:'https://user:pass@example.com'}));assert.equal(gameConfig({GAME_API_URL:'http://localhost:4000/ingest'}),'http://localhost:4000/ingest');});
test('POST preserves all banks and sends server Bearer token',async()=>{const input=fixture();const result=await publishGamePackage(input,env,async(url,options)=>{assert.equal(url,env.GAME_API_URL);assert.equal(options.headers.Authorization,'Bearer secret');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),input);return Response.json({status:'success',data:{package_id:'pkg-1',questions_saved:{total:4}}},{status:201});});assert.equal(result.status,201);assert.equal(result.body.data.package_id,'pkg-1');});
test('sample permits absent test bank without losing other questions',async()=>{const p=fixture();delete p.test_questions;p.check_for_understanding=Array(6).fill(q);p.battle_questions=Array(3).fill(q);assert.equal((await publishGamePackage(p,env,async()=>Response.json({status:'success',data:{package_id:'pkg'}}))).status,201);});
test('incomplete drafts and embedded images fail before network access',async()=>{for(const change of [p=>p.concept.name='',p=>p.learning_content.image_url='data:image/png;base64,abc',p=>p.battle_questions[0]={...q,answer:'wrong'}]){const p=fixture();change(p);const r=await publishGamePackage(p,env,()=>assert.fail('must not call game'));assert.equal(r.status,400);}});
test('missing configuration and unconfirmed writes never report success or retry',async()=>{assert.equal((await publishGamePackage(fixture(),{})).status,503);for(const response of [()=>Response.json({error:'secret'},{status:401}),()=>new Response('invalid'),()=>Response.json({status:'success',data:{}}),()=>{throw Error('timeout');}]){let calls=0;const r=await publishGamePackage(fixture(),env,async()=>{calls++;return response();});assert.equal(r.status,502);assert.equal(calls,1);assert.ok(!JSON.stringify(r).includes('secret'));}});
test('publish button shows confirmation, prevents duplicate writes and restores state',async()=>{const source=readFileSync(new URL('./workflow.js',import.meta.url),'utf8').split('let gamePublishBusy=false;')[1];const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{setAttribute(){},removeAttribute(){}});return nodes.get(id);};let calls=0;const ctx={document:{getElementById:$},$,operationBusy:false,buildPayload:fixture,AbortSignal,JSON,Error,syncStudioUI(){},fetch:async(url,options)=>{assert.equal(url,'/api/publish-game');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),fixture());calls++;return Response.json({status:'success',data:{package_id:'pkg-1',questions_saved:{total:4}}});}};runInNewContext('let gamePublishBusy=false;'+source,ctx);await ctx.sendToGame();assert.match($('gamePublishStatus').textContent,/pkg-1/);assert.equal($('sendGameBtn').disabled,false);await ctx.sendToGame();assert.equal(calls,1);});


test('Vercel forwarding validates requests and sends the full package to live API',async()=>{
 const {default:handler}=await import('./api/[...path].mjs');
 const originalFetch=globalThis.fetch;
 const originalUrl=process.env.GAME_API_URL;
 delete process.env.GAME_API_URL;
 let calls=0;
 try{
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://kidsverse-apinew.vercel.app/api/v1/admin/content/feed');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),fixture());return Response.json({status:'success',data:{package_id:'live-test'}},{status:201});};
  const request=body=>new Request('https://kvsdigitalcontent.vercel.app/api/publish-game',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://kvsdigitalcontent.vercel.app'},body:JSON.stringify(body)});
  assert.equal((await handler.fetch(request({}))).status,400);assert.equal(calls,0);
  const response=await handler.fetch(request(fixture()));assert.equal(response.status,207);const body=await response.json();assert.equal(body.targets.live.data.package_id,'live-test');assert.equal(body.targets.original.saved,false);assert.equal(calls,1);
  const crossOrigin=new Request('https://kvsdigitalcontent.vercel.app/api/publish-game',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:JSON.stringify(fixture())});
  assert.equal((await handler.fetch(crossOrigin)).status,403);assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.GAME_API_URL;else process.env.GAME_API_URL=originalUrl;}
});


test('dual publishing reports each destination, including partial and thrown failures',async()=>{
 const {publishBoth,liveEnvironment}=await import('./dual-publish.mjs');
 const ok=id=>({status:201,body:{status:'success',data:{package_id:id}}});
 let liveCalls=0;
 const result=await publishBoth(fixture(),{},async()=>ok('old'),async(p,env)=>{liveCalls++;assert.deepEqual(p,fixture());assert.match(env.GAME_API_URL,/admin\/content\/feed$/);return ok('new');});
 assert.equal(result.status,201);assert.equal(result.body.targets.original.data.package_id,'old');assert.equal(result.body.targets.live.data.package_id,'new');assert.equal(liveCalls,1);
 const partial=await publishBoth(fixture(),{},async()=>ok('old'),async()=>({status:502,body:{error:'Live API returned 500'}}));
 assert.equal(partial.status,207);assert.equal(partial.body.status,'partial');assert.equal(partial.body.targets.original.saved,true);assert.equal(partial.body.targets.live.saved,false);
 const thrown=await publishBoth(fixture(),{},async()=>{throw Error('secret');},async()=>ok('new'));
 assert.equal(thrown.body.targets.original.saved,false);assert.equal(thrown.body.targets.live.saved,true);assert.ok(!JSON.stringify(thrown).includes('secret'));
 assert.equal(liveEnvironment({GAME_API_URL:'https://kidsverse-apinew.vercel.app/api/v1/'}).GAME_API_URL,'https://kidsverse-apinew.vercel.app/api/v1/admin/content/feed');
 let calls=0;assert.equal((await publishBoth({}, {},async()=>{calls++;},async()=>{calls++;})).status,400);assert.equal(calls,0);
});
