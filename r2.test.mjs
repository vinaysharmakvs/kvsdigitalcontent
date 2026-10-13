import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {uploadImage,storageStatus} from './r2.mjs';
import {generateImage} from './server.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'account',CLOUDFLARE_API_TOKEN:'ai-token',R2_ACCESS_KEY_ID:'key',R2_SECRET_ACCESS_KEY:'secret',R2_BUCKET_NAME:'pictures',R2_PUBLIC_BASE_URL:'https://images.example.com/'};
const data=Buffer.from([255,216,255,224,0,16]).toString('base64');
const ai=async()=>({ok:true,json:async()=>({success:true,result:{image:data}})});
test('upload writes bytes, MIME and a unique key before returning a public URL',async()=>{
 const calls=[];const client={send:async command=>calls.push(command.input)};
 const first=await uploadImage(data,env,client);const second=await uploadImage(data,env,client);
 assert.equal(calls[0].Bucket,'pictures');assert.equal(calls[0].ContentType,'image/jpeg');assert.deepEqual(calls[0].Body,Buffer.from(data,'base64'));
 assert.equal(first.url,'https://images.example.com/'+calls[0].Key);assert.notEqual(first.objectKey,second.objectKey);
});
test('missing R2 config prevents paid AI generation',async()=>{
 let called=false;const result=await generateImage({prompt:'apples'},{CLOUDFLARE_ACCOUNT_ID:'a',CLOUDFLARE_API_TOKEN:'b'},async()=>{called=true});
 assert.equal(result.status,503);assert.equal(called,false);
});
test('S3 endpoint is not accepted as a public delivery URL',()=>assert.equal(storageStatus({...env,R2_PUBLIC_BASE_URL:'https://account.r2.cloudflarestorage.com'}).storageConfigured,false));
test('upload failure returns no success URL or secret details',async()=>{
 const result=await generateImage({prompt:'apples'},env,ai,async()=>{throw Error('secret')});
 assert.equal(result.status,502);assert.equal(result.body.url,undefined);assert.doesNotMatch(result.body.error,/secret/);
});
test('successful generation returns hosted URL and object key',async()=>{
 const result=await generateImage({prompt:'apples'},env,ai,(bytes,config)=>uploadImage(bytes,config,{send:async()=>{}}));
 assert.equal(result.status,200);assert.match(result.body.url,/^https:\/\/images.example.com\/content\//);assert.equal(result.body.storage,'r2');
});

test('every image request overrides text and number instructions in existing briefs',async()=>{
 let providerPrompt='';
 const result=await generateImage({prompt:'Seven apples with number cards 1 to 7 and a caption saying Count'},env,async(url,options)=>{providerPrompt=JSON.parse(options.body).prompt;return ai();},async()=>({url:'https://images.example.com/test.jpg',objectKey:'test.jpg',mimeType:'image/jpeg'}));
 assert.equal(result.status,200);
 assert.match(providerPrompt,/one simple.*illustration/);
 assert.match(providerPrompt,/No text, words, letters, digits, written numbers/);
 assert.match(providerPrompt,/override any conflicting image brief/);
 assert.match(providerPrompt,/quantities with unlabelled objects only/);
 assert.match(providerPrompt,/Final image: one simple illustration only/);
});
test('invalid image bytes are never uploaded',async()=>{
 let called=false;await assert.rejects(uploadImage('aGVsbG8=',env,{send:async()=>{called=true}}));assert.equal(called,false);
});
test('editor stores hosted URL while keeping a local download preview; failures preserve prior URL',async()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('async function attachImage('),html.indexOf('\nfunction clearPreviewImage'));
 const context={requestImageBlob:async()=>({blob:{},mimeType:'image/jpeg',publicUrl:'https://images.example.com/image.jpg',objectKey:'image.jpg'}),URL:{createObjectURL:()=> 'blob:preview',revokeObjectURL:()=>{}}};
 runInNewContext(source+'\nthis.attachImage=attachImage;',context);
 const field={value:'old'},preview={dataset:{},style:{}},button={style:{}};
 const result=await context.attachImage(field,preview,button,'apples');assert.equal(field.value,'https://images.example.com/image.jpg');assert.equal(result.portable,field.value);
 context.requestImageBlob=async()=>{throw Error('Upload failed')};await assert.rejects(context.attachImage(field,preview,button,'apples'));assert.equal(field.value,'https://images.example.com/image.jpg');
});
