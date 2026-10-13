import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generate,generateImage,schemaFor,fetchGemini,importDraft} from './server.mjs';
import vercelHandler from './api/[...path].mjs';
const input={curriculum:{grade:'Grade 1',board:'CBSE',subject:'Mathematics',topic:'Fractions'},concept:{name:'Equal Parts',learning_objective:''},instructions:'',learningOnly:false};
const env={GEMINI_API_KEY:'test-only',GEMINI_MODEL:'test-model'};
const fixture=()=>{const d=Object.fromEntries(['objective','method','explanation','hint1','hint2','hint3','nova','novaFeedback','imagePrompt'].map(k=>[k,'Example']));d.learningSteps=['understand','example','remember'].map((stepKey,i)=>({stepKey,title:'Step '+(i+1),teachingText:'Clear teaching text '+i,keyIdea:'A useful key idea',imagePrompt:'A distinct educational picture '+i,novaScript:'Nova explains the step',miniQuestion:{question:`Learning check ${i+1}?`,options:['A','B','C'],answer:'A',explanation:'A is correct.'}}));d.exampleAlternatives=[1,2].map(i=>({label:'Try object '+i,teachingText:'Another concrete object '+i,keyIdea:'Same idea',imagePrompt:'A matching image of object '+i,novaScript:'Nova explains object '+i,miniQuestion:{question:'Alternate check '+i+'?',options:['A','B','C'],answer:'A',explanation:'A is correct.'}}));for(const [k,n] of Object.entries({cfu:3,test:5,battle:3,challenge:1}))d[k]=Array.from({length:n},(_,i)=>({question:`${k} question ${i+1}?`,options:['1','2','3','4'],answer:'2',difficulty:'Easy',explanation:'Two equal halves make a whole.',imagePrompt:`A ${k} picture for question ${i+1}`,hints:['Look carefully','Count the parts','Compare the options'],novaScript:'Nova reads the question',xp:20,marks:1,novaFeedback:'Keep exploring.'}));return d;};
const mock=d=>async(url,options)=>{const required=JSON.parse(options.body).generationConfig.responseJsonSchema.required;const response=Object.fromEntries(required.filter(key=>Object.hasOwn(d,key)).map(key=>[key,d[key]]));return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(response)}]}}]})}};
test('missing key gives setup message',async()=>assert.equal((await generate(input,{})).status,503));
test('Cloudflare image generation does not require a Gemini key',async()=>{const env={CLOUDFLARE_API_TOKEN:'token',CLOUDFLARE_ACCOUNT_ID:'account',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test',R2_BUCKET_NAME:'test',R2_PUBLIC_BASE_URL:'https://images.example.com'};const response=await generateImage({prompt:'Three red balls and one blue ball'},env,async()=>({ok:true,json:async()=>({success:true,result:{image:'aW1hZ2U='}})}),async()=>({url:'https://images.example.com/test.jpg',objectKey:'test.jpg',mimeType:'image/jpeg'}));assert.equal(response.status,200);assert.equal(response.body.provider,'cloudflare');});
test('images do not fall back to Gemini',async()=>assert.equal((await generateImage({prompt:'A counting picture'},{GEMINI_API_KEY:'text-only'})).status,503));
test('Vercel status only reports image generation ready with Cloudflare credentials',async()=>{
 const keys=['GEMINI_API_KEY','GEMINI_MODEL','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  process.env.GEMINI_API_KEY='test-only';process.env.GEMINI_MODEL='test-model';
  delete process.env.CLOUDFLARE_API_TOKEN;delete process.env.CLOUDFLARE_ACCOUNT_ID;
  const response=await vercelHandler.fetch(new Request('https://example.test/api/status'));
  const status=await response.json();
  assert.equal(status.configured,true);
  assert.equal(status.imageConfigured,false);
  assert.equal(status.imageProvider,'cloudflare');
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
test('valid structured draft accepted',async()=>assert.equal((await generate(input,env,mock(fixture()))).status,200));
test('valid learning-only draft accepted without question banks',async()=>{const d=fixture();for(const bank of ['cfu','test','battle','challenge'])delete d[bank];assert.equal((await generate({...input,learningOnly:true},env,mock(d))).status,200);});
test('invalid answer rejected',async()=>{const d=fixture();d.test[0].answer='5';assert.equal((await generate(input,env,mock(d))).status,502);});
test('repeated questions across learning and assessment are rejected',async()=>{const d=fixture();d.test[0].question=d.cfu[0].question;assert.equal((await generate(input,env,mock(d))).status,502);});
test('repeated tiny checks in learning-only drafts are rejected',async()=>{const d=fixture();delete d.cfu;delete d.test;delete d.battle;delete d.challenge;d.exampleAlternatives[0].miniQuestion.question='  LEARNING check 1!! ';assert.equal((await generate({...input,learningOnly:true},env,mock(d))).status,502);});
test('duplicate mini-check options are rejected',async()=>{const d=fixture();d.learningSteps[0].miniQuestion.options=['A','a ','C'];assert.equal((await generate(input,env,mock(d))).status,502);});
test('alternate examples need distinct image briefs',async()=>{const d=fixture();d.exampleAlternatives[1].imagePrompt=d.exampleAlternatives[0].imagePrompt.toUpperCase()+'!';assert.equal((await generate(input,env,mock(d))).status,502);});
test('assessment image briefs must vary with questions',async()=>{const d=fixture();d.test[1].imagePrompt=d.test[0].imagePrompt;assert.equal((await generate(input,env,mock(d))).status,502);});
test('unexpected generation fields are rejected',async()=>{const d=fixture();d.learningSteps[0].imageUrl='https://example.test/image.webp';assert.equal((await generate(input,env,mock(d))).status,502);});
test('quota error handled',async()=>assert.equal((await generate(input,env,async()=>({ok:false,status:429}))).status,429));
test('learning-only schema omits questions',()=>assert.equal(schemaFor(true).properties.test,undefined));
test('learning-only schema includes three learning steps',()=>assert.equal(schemaFor(true).properties.learningSteps.minItems,3));
test('learning-only schema includes two alternate Example ways',()=>assert.equal(schemaFor(true).properties.exampleAlternatives.minItems,2));
test('question schema includes visual, hints and Nova fields',()=>{const question=schemaFor(false).properties.test.items.properties;assert.ok(question.imagePrompt);assert.ok(question.hints);assert.ok(question.novaScript);});
test('malformed inputs rejected',async()=>assert.equal((await generate({},env)).status,400));
test('curriculum generates structured topics and concepts',async()=>{const d={topics:Array.from({length:5},(_,i)=>({name:'Topic '+i,concepts:[{name:'Concept A',objective:'Identify A'},{name:'Concept B',objective:'Identify B'}]}))};assert.equal((await generate({grade:'Grade 1',board:'CBSE',subject:'English'},env,mock(d),'curriculum')).status,200);});
test('duplicate curriculum topics rejected',async()=>{const d={topics:Array.from({length:5},()=>({name:'Same',concepts:[{name:'A',objective:'Identify A'},{name:'B',objective:'Identify B'}]}))};assert.equal((await generate({grade:'Grade 1',board:'CBSE',subject:'English'},env,mock(d),'curriculum')).status,502);});
test('punctuation and case do not disguise duplicate curriculum topics',async()=>{const d={topics:Array.from({length:5},(_,i)=>({name:i===1?' SHAPES! ':i===0?'Shapes':`Topic ${i}`,concepts:[{name:'Concept A',objective:'Identify A'},{name:'Concept B',objective:'Identify B'}]}))};assert.equal((await generate({grade:'Grade 1',board:'CBSE',subject:'English'},env,mock(d),'curriculum')).status,502);});
test('content generation ignores a legacy theme and splits learning from assessment',async()=>{const requests=[];await generate({...input,theme:'Space'},env,async(url,options)=>{requests.push(JSON.parse(options.body));return mock(fixture())(url,options)});assert.equal(requests.length,2);assert.match(requests[0].systemInstruction.parts[0].text,/familiar examples that suit the selected concept and grade/);assert.match(requests[1].systemInstruction.parts[0].text,/check-for-understanding, 5 test, 3 battle and 1 challenge/);assert.ok(requests.every(request=>!('theme' in JSON.parse(request.contents[0].parts[0].text))));});

test('temporary Gemini errors retry with bounded backoff and recover',async()=>{
 let calls=0;const delays=[];
 const response=await fetchGemini('https://example.test',{},async()=>({status:++calls<3?503:200}),async ms=>delays.push(ms));
 assert.equal(response.status,200);assert.equal(calls,3);assert.deepEqual(delays,[1000,2000]);
});
test('persistent Gemini overload stops after three attempts',async()=>{
 let calls=0;const response=await fetchGemini('https://example.test',{},async()=>{calls++;return {status:503}},async()=>{});
 assert.equal(response.status,503);assert.equal(calls,3);
});
test('Gemini authentication and quota failures are not repeatedly retried',async()=>{
 for(const status of [400,401,403,429]){let calls=0;await fetchGemini('https://example.test',{},async()=>{calls++;return {status}},async()=>{});assert.equal(calls,1);}
});

test('manual import accepts a complete draft without API credentials',()=>assert.equal(importDraft(fixture()).status,200));
test('manual import names the missing nested field so the response can be corrected',()=>{
 const draft=fixture();delete draft.learningSteps[1].imagePrompt;
 const result=importDraft(draft);assert.equal(result.status,400);assert.match(result.body.error,/content\.learningSteps\[1\]\.imagePrompt/);
});
test('manual import rejects incomplete content and mismatched answers',()=>{
 assert.equal(importDraft({}).status,400);const d=fixture();d.test[0].answer='invalid';assert.equal(importDraft(d).status,400);
});
