import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const mappingSource=source('mapping.js');
const curriculumSource=source('curriculum.js').replace(/initializeCurriculumMapping\(\);\s*$/,'');
const workflowSource=source('workflow.js').split("if(document.getElementById('workflowNext'))")[0];
const html=source('index.html');
const fragment=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const english={catalog:{Nouns:[{name:'Common and Proper Nouns',objective:'Identify common and proper nouns.'},{name:'Collective Nouns',objective:'Recognize collective nouns.'}]},curriculum:{grade:'Grade 3',board:'ICSE',subject:'English',topic:'Nouns'},selectedConceptIndex:0,objective:'Identify common and proper nouns.'};
const maths={catalog:{Numbers:[{name:'Counting',objective:'Count objects.'}]},curriculum:{grade:'Grade 1',board:'CBSE',subject:'Mathematics',topic:'Numbers'},selectedConceptIndex:0,objective:'Count objects.'};
function harness(){
 const fields=new Map(),store=new Map();let blocked=false;
 class Option{constructor(text,value=text){this.text=text;this.value=String(value);}}
 const get=id=>{
  if(!fields.has(id))fields.set(id,{id,value:'',disabled:false,textContent:'',checked:false,type:'text',open:false,hidden:false,style:{},classList:{add(){},remove(){}},replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';},addEventListener(){}});
  return fields.get(id);
 };
 for(const [key,value] of Object.entries(maths.curriculum))get(key).value=value;
 const context={$:get,Option,AbortSignal,location:{href:''},document:{getElementById:get,querySelectorAll:()=>[...fields.values()]},localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>{if(blocked)throw Error('Storage blocked');store.set(key,value);}},setTimeout:()=>1,clearTimeout(){}};
 runInNewContext(mappingSource,context);
 return {get,store,context,block:()=>{blocked=true;}};
}

test('generated English mapping enables both continue buttons and carries edited objective on navigation',async()=>{
 const {get,context}=harness();runInNewContext(curriculumSource,context);
 for(const key of ['grade','board','subject'])get(key).value=english.curriculum[key];
 context.syncMappingControls();assert.equal(get('openStudioBtn').disabled,true);
 context.fetch=async()=>({ok:true,json:async()=>({topics:[{name:'Nouns',concepts:english.catalog.Nouns}]})});
 await context.generateCurriculum();
 assert.equal(get('openStudioBtn').disabled,false);assert.equal(get('headerOpenStudioBtn').disabled,false);
 get('concept').value='1';runInNewContext('selected=1;renderCurrent();',context);
 get('objective').value='Recognize collective nouns in short sentences.';context.saveAndOpen();
 const saved=context.readSavedCurriculumMapping();assert.equal(saved.curriculum.subject,'English');assert.equal(saved.selectedConceptIndex,1);assert.equal(saved.objective,get('objective').value);assert.equal(context.location.href,'/?studio=1');
 context.restoreCurriculumMapping();assert.equal(get('objective').value,'Recognize collective nouns in short sentences.');assert.equal(get('concept').value,'1');
});

test('changing class clears stale topics and returning restores the correct saved catalog',()=>{
 const {get,context}=harness();runInNewContext(curriculumSource,context);
 context.saveCurriculumMapping(english);context.restoreCurriculumMapping();
 get('grade').value='Grade 4';context.changeCurriculumContext();
 assert.equal(get('topic').value,'');assert.equal(get('objective').value,'');assert.equal(get('openStudioBtn').disabled,true);
 assert.equal(context.readSavedCurriculumMapping().curriculum.grade,'Grade 4');assert.equal(context.readSavedCurriculumMapping().curriculum.subject,'English');
 get('grade').value='Grade 3';context.changeCurriculumContext();assert.equal(get('topic').value,'Nouns');assert.equal(context.current().name,'Common and Proper Nouns');
 get('board').value='CBSE';context.changeCurriculumContext();assert.equal(get('topic').value,'');
});

test('failed browser saving keeps the user on Mapping instead of opening an old selection',()=>{
 const {context,block,get}=harness();runInNewContext(curriculumSource,context);context.saveCurriculumMapping(english);context.restoreCurriculumMapping();block();context.saveAndOpen();
 assert.equal(context.location.href,'');assert.match(get('mappingSaveStatus').textContent,/Could not save/);
});

function studioHarness(){
 const result=harness(),{context,get}=result;
 Object.assign(context,{catalog:maths.catalog,selectedConceptIndex:0,questionData:{cfu:[],test:[],battle:[],challenge:[]},questionCounters:{cfu:0,test:0,battle:0,challenge:0},saved:false,
  currentConcept:()=>context.catalog[get('topic').value]?.[context.selectedConceptIndex]||{name:'',objective:''},
  resolveMappings:()=>{context.selectedConceptIndex=0;},renderQuestions(){},updatePayload(){},showToast(){},showWorkspace(){},
  clearAuthoring:()=>{get('method').value='';get('objective').value='';context.questionData={cfu:[],test:[],battle:[],challenge:[]};},
  learningStepsPayload:()=>[],collectQuestionData:()=>[],navigator:{clipboard:{writeText:async text=>{context.copied=text;}}},fetch:async()=>({ok:true,json:async()=>({type:'object',properties:{}})}),
 });
 context.saveCurriculumMapping(maths);get('method').value='Count each object once.';
 runInNewContext(workflowSource,context);
 runInNewContext('studioInitialized=true;syncStudioUI=()=>{};studioDraftFields=()=>[$("method")];',context);
 runInNewContext(fragment('function loadSavedCurriculumMapping(){','\n["grade","board","subject"]'),context);
 runInNewContext(fragment('function buildPayload(){','\nfunction previewVisual'),context);
 runInNewContext(fragment('async function copyChatGPTPrompt(){','\nasync function generateContent'),context);
 context.syncSavedCurriculumMapping();return result;
}

test('open Studio follows English mapping and its prompt uses the selected class, board, concept and objective',async()=>{
 const {context,get}=studioHarness();const oldDraftKey=context.studioDraftKey();
 context.saveCurriculumMapping(english);context.syncSavedCurriculumMapping();await context.copyChatGPTPrompt();
 assert.match(context.copied,/"grade":"Grade 3"/);assert.match(context.copied,/"board":"ICSE"/);assert.match(context.copied,/"subject":"English"/);assert.match(context.copied,/Common and Proper Nouns/);assert.match(context.copied,/Identify common and proper nouns/);assert.doesNotMatch(context.copied,/Mathematics/);
 assert.equal(get('method').value,'');assert.equal(JSON.parse(context.localStorage.getItem(oldDraftKey)).fields.method,'Count each object once.');
 context.saveCurriculumMapping(maths);context.syncSavedCurriculumMapping();assert.equal(get('method').value,'Count each object once.');
});

test('a partial new selection prevents an old Maths prompt, and busy generation defers switching context',async()=>{
 const {context,get}=studioHarness();
 runInNewContext('operationBusy=true;',context);context.saveCurriculumMapping(english);context.syncSavedCurriculumMapping();assert.equal(get('subject').value,'Mathematics');
 runInNewContext('operationBusy=false;',context);context.syncSavedCurriculumMapping();assert.equal(get('subject').value,'English');
 context.saveCurriculumMapping({...english,catalog:{},curriculum:{...english.curriculum,grade:'Grade 4',topic:''}});context.syncSavedCurriculumMapping();await context.copyChatGPTPrompt();
 assert.equal(get('grade').value,'Grade 4');assert.equal(context.currentConcept().name,'');assert.match(get('manualStatus').textContent,/Select a concept/);assert.equal(context.copied,undefined);
});
