import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./workflow.js',import.meta.url),'utf8').split("if(document.getElementById('workflowNext'))")[0];
function draftHarness(){
 const fields=new Map();const store=new Map();let concept='Counting';let blocked=false;
 const get=id=>{if(!fields.has(id))fields.set(id,{id,value:'',textContent:'',type:'text'});return fields.get(id);};
 get('grade').value='Grade 1';get('board').value='CBSE';get('subject').value='Mathematics';get('topic').value='Numbers';get('method').value='Count objects';
 const context={
  $:get,currentConcept:()=>({name:concept}),document:{querySelectorAll:()=>[]},
  questionData:{cfu:[{id:'cfu_1',type:'cfu',question:'How many?'}],test:[],battle:[],challenge:[]},questionCounters:{cfu:1,test:0,battle:0,challenge:0},
  localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>{if(blocked)throw Error('Storage blocked');store.set(key,value);}},
  setTimeout:()=>1,clearTimeout:()=>{},renderQuestions:()=>{},updatePayload:()=>{},
 };
 runInNewContext(source,context);
 runInNewContext("studioInitialized=true;studioDraftFields=()=>[$('method')];syncStudioUI=()=>{};",context);
 return {get,store,context,setConcept:name=>{concept=name;},block:()=>{blocked=true;}};
}
test('draft restores teaching edits and question banks for the selected concept',()=>{
 const {get,context}=draftHarness();context.queueDraftSave();context.flushStudioDraft();
 get('method').value='';context.questionData.cfu=[];context.restoreStudioDraft();
 assert.equal(get('method').value,'Count objects');assert.equal(context.questionData.cfu[0].question,'How many?');assert.equal(context.questionCounters.cfu,1);
});
test('drafts are separated by concept and pending writes keep their captured context',()=>{
 const {get,context,setConcept,store}=draftHarness();context.queueDraftSave();const originalKey=context.studioDraftKey();setConcept('Addition');get('method').value='Join groups';context.flushStudioDraft();
 assert.equal(JSON.parse(store.get(originalKey)).fields.method,'Count objects');
 assert.equal(store.has(context.studioDraftKey()),false);
 context.queueDraftSave();context.flushStudioDraft();setConcept('Counting');context.restoreStudioDraft();assert.equal(get('method').value,'Count objects');
 setConcept('Addition');context.restoreStudioDraft();assert.equal(get('method').value,'Join groups');
});
test('storage failure reports an unsaved draft and does not claim success',()=>{
 const {get,context,block,store}=draftHarness();block();context.queueDraftSave();context.flushStudioDraft();
 assert.match(get('draftStatus').textContent,/Could not save/);assert.equal(store.size,0);
});

test('import diagnostics identify four Test questions and require five without dropping existing questions',()=>{
 const {context}=draftHarness();const data={learningSteps:[{},{},{}],exampleAlternatives:[{},{}],cfu:[{},{},{}],test:[{},{},{},{}],battle:[{},{},{}],challenge:[{}]};
 const result=context.analyzeImportJson(JSON.stringify(data));
 assert.deepEqual(Array.from(result.issues),['Test: received 4, needs exactly 5.']);assert.equal(result.data.test.length,4);
 data.test.push({});assert.equal(context.analyzeImportJson(JSON.stringify(data)).issues.length,0);
});

test('import diagnostics distinguish curriculum JSON and invalid syntax',()=>{
 const {context}=draftHarness();assert.match(context.analyzeImportJson('{bad').error,/syntax/);assert.match(context.analyzeImportJson('{"topics":[]}').error,/curriculum/);
});
