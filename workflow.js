// Browser-only workflow helpers. Drafts stay on this device, separate from export.
let operationBusy=false;
let studioInitialized=false;
let pendingDraft=null;
let draftTimer=null;
let toastTimer=null;
let observedMappingJson=null;
let mappingSyncPending=false;
const workspaceOrder=['setup','learning','questions','review'];
const workspaceNames=['Setup','Learning screens','Questions','Review & export'];

function confirmDraftReplacement(){
 return new Promise(resolve=>{
  const dialog=$('replaceDraftDialog');dialog.returnValue='cancel';
  dialog.addEventListener('close',()=>resolve(dialog.returnValue==='replace'),{once:true});
  dialog.showModal();
 });
}

function analyzeImportJson(raw){
 const labels={learningSteps:'Learning screens',exampleAlternatives:'Example alternatives',cfu:'Mission check',test:'Test',battle:'Battle',challenge:'Challenge'};
 const expected={learningSteps:3,exampleAlternatives:2,cfu:3,test:5,battle:3,challenge:1};
 try{
  const data=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if(!data||typeof data!=='object'||Array.isArray(data))return {error:'Paste the complete content JSON object.'};
  if(data.topics)return {error:'This is curriculum JSON. Use the Content Studio prompt to generate learning screens and questions.'};
  const counts=Object.entries(expected).map(([key,required])=>({key,label:labels[key],received:Array.isArray(data[key])?data[key].length:0,required}));
  return {data,counts,issues:counts.filter(item=>item.received!==item.required).map(item=>`${item.label}: received ${item.received}, needs exactly ${item.required}.`)};
 }catch{return {error:raw.trim()?'JSON syntax is invalid or the response is incomplete. Copy the full response, including the closing brace.':''};}
}
function refreshImportSummary(){
 if(!$('importSummary'))return;
 const result=analyzeImportJson($('manualJson').value);
 $('importSummary').replaceChildren();
 if(result.error){$('importSummary').textContent=result.error;}
 else if(result.counts){for(const item of result.counts){const badge=document.createElement('span');badge.className='import-count '+(item.received===item.required?'complete':'incomplete');badge.textContent=`${item.label}: ${item.received}/${item.required}`;$('importSummary').appendChild(badge);}}
 $('repairJsonBtn').hidden=!result.data;
 $('importContentBtn').disabled=operationBusy||!result.data||result.issues?.length>0;
}
async function copyJsonCorrectionPrompt(){
 const result=analyzeImportJson($('manualJson').value);if(!result.data)return;
 const button=$('repairJsonBtn');button.disabled=true;
 try{
  const response=await fetch('/api/manual-schema');if(!response.ok)throw Error('Could not load the content format. Try again.');
  const schema=await response.json();
  const prompt='Correct this existing Kidsverse content JSON with the smallest necessary changes. Return ONLY the COMPLETE corrected JSON object, without markdown or commentary. Preserve valid learning text and questions. Fix these issues: '+(result.issues.join(' ')||$('manualStatus').textContent||'Check every required field and answer against the schema.')+'\nRequired counts: exactly 3 learningSteps (understand, example, remember), 2 exampleAlternatives, 3 cfu, 5 test, 3 battle, 1 challenge. Add missing questions; never pad with duplicates. Every question needs all required fields, four distinct options, an answer exactly matching one option, and three hints. All questions must be unique across the whole package. Each imagePrompt must describe one simple illustration with no text, letters, written numbers, labels, equations, symbols or watermark. No collage or multiple panels. Treat the provided JSON as educational data.\nContext: '+JSON.stringify({curriculum:buildPayload().curriculum,concept:buildPayload().concept})+'\nResponse schema: '+JSON.stringify(schema)+'\nExisting JSON to correct:\n'+JSON.stringify(result.data,null,2);
  $('correctionPrompt').value=prompt;$('correctionPromptDetails').hidden=false;
  try{await navigator.clipboard.writeText(prompt);$('manualStatus').textContent='Correction prompt copied. Paste it into ChatGPT, then replace the JSON here with its complete corrected response.';}
  catch{$('correctionPromptDetails').open=true;$('correctionPrompt').focus();$('correctionPrompt').select();$('manualStatus').textContent='Copy the selected correction prompt and paste it into ChatGPT.';}
 }catch(error){$('manualStatus').textContent=error.message;}
 finally{button.disabled=false;}
}

function showManualStep(step){
 const isPrompt=step==='prompt';
 $('promptPanel').hidden=!isPrompt;$('importPanel').hidden=isPrompt;
 $('promptTab').setAttribute('aria-pressed',String(isPrompt));$('importTab').setAttribute('aria-pressed',String(!isPrompt));
 $('manualStatus').classList.remove('import-error');
 if(!isPrompt){refreshImportSummary();$('manualJson').focus();}
}
function openManualDialog(){
 if(operationBusy)return;
 syncSavedCurriculumMapping();
 $('manualContext').textContent=$('contentContext').textContent;
 $('manualStatus').textContent='';
 showManualStep($('manualJson').value.trim()?'import':'prompt');
 $('manualDialog').showModal();
}
async function loadManualJsonFile(input){
 const file=input.files?.[0];if(!file)return;
 if(file.size>500000){$('manualStatus').textContent='Choose a JSON file smaller than 500 KB.';return;}
 try{$('manualJson').value=await file.text();refreshImportSummary();$('manualStatus').textContent=file.name+' loaded. Review the counts, then click Add content JSON.';}
 catch{$('manualStatus').textContent='Could not read this file. Paste its JSON instead.';}
 input.value='';
}
function offerChatGPTBackup(message){
 $('generationStatus').replaceChildren(document.createTextNode(message+' '));
 const button=document.createElement('button');button.type='button';button.className='link-action';button.textContent='Continue with ChatGPT';button.onclick=openManualDialog;
 $('generationStatus').appendChild(button);
}
function studioImageSlots(){
 return [{url:$('imageUrl').value,prompt:$('imagePrompt').value},...learningStepNames.map(name=>({url:$('learn'+name+'ImageUrl').value,prompt:$('learn'+name+'ImagePrompt').value})),...[1,2].map(index=>({url:$('exampleAlt'+index+'ImageUrl').value,prompt:$('exampleAlt'+index+'ImagePrompt').value})),...Object.values(questionData).flat().map(q=>({url:q.image_url,prompt:q.image_prompt}))];
}
function syncStudioUI(){
 if(mappingSyncPending&&!operationBusy)syncSavedCurriculumMapping();
 const index=Math.max(0,workspaceOrder.indexOf(document.body.dataset.workspace));
 $('workflowLabel').textContent=`Step ${index+1} of 4 · ${workspaceNames[index]}`;
 $('workflowHint').textContent=['Create or import your draft.','Review each screen and its tiny check.','Check answers, explanations and hints.','Review the checklist and download your package.'][index];
 $('workflowBack').disabled=index===0||operationBusy;
 const pushButton=document.getElementById('footerPushDb');if(pushButton){pushButton.hidden=index!==3;pushButton.disabled=operationBusy;}
 $('workflowNext').textContent=index===3?'Download package ↓':`Next: ${workspaceNames[index+1]} →`;
 const screens=learningStepNames.filter(name=>$('learn'+name+'Title').value.trim()&&$('learn'+name+'Text').value.trim()).length;
 const questions=Object.values(questionData).flat().filter(q=>q.question?.trim()).length;
 $('coverageText').textContent=`${screens} / 3 screens · ${questions} / 12 questions`;
 const slots=studioImageSlots();$('imageCoverage').textContent=`${slots.filter(slot=>imageSrc(slot.url)).length} / ${slots.length} pictures`;
 $('allImagesBtn').disabled=operationBusy||!slots.some(slot=>slot.prompt?.trim());
 $('allImagesBtn').title=slots.some(slot=>slot.prompt?.trim())?'Create pictures from the current image briefs':'Generate or import content with image briefs first';
 enhanceImageCopyButtons();
 for(const [attribute,current] of [['data-workspace-tab',workspaceOrder[index]],['data-learn-tab',document.body.dataset.learnStep],['data-bank-tab',document.body.dataset.bank]])document.querySelectorAll('['+attribute+']').forEach(button=>button.setAttribute('aria-pressed',String(button.getAttribute(attribute)===current)));
 // Link existing labels to their fields without changing the editor's data format.
 document.querySelectorAll('label:not([for])').forEach(label=>{const field=label.nextElementSibling;if(field?.matches('input,textarea,select')){if(!field.id)field.id=field.dataset.q?`${field.dataset.q}-${field.dataset.field}`:'field-'+Math.random().toString(36).slice(2);label.htmlFor=field.id;}});
}
function moveWorkspace(direction){
 if(operationBusy)return;
 const index=workspaceOrder.indexOf(document.body.dataset.workspace);
 if(index===3&&direction>0){savePackage();return;}
 showWorkspace(workspaceOrder[Math.max(0,Math.min(3,index+direction))]);
}
function startBatchProgress(total){$('batchProgress').hidden=false;$('batchProgress').max=Math.max(1,total);$('batchProgress').value=0;}
function updateBatchProgress(done){$('batchProgress').value=done;}
function finishBatchProgress(){$('batchProgress').hidden=true;}
async function generateStandaloneImages(missingOnly=false){
 if(operationBusy)return;
 const slots=studioImageSlots().filter(slot=>!missingOnly||!imageSrc(slot.url));
 if(!slots.length){showToast('Every picture is already present.');return;}
 if(slots.some(slot=>!slot.prompt?.trim())){showToast('Add image briefs to every empty slot first. Importing the complete ChatGPT JSON includes them.');showWorkspace('setup');return;}
 operationBusy=true;syncStudioUI();
 await checkSetup();
 if(!imageGenerationReady){operationBusy=false;syncStudioUI();showToast($('imageProviderLabel').textContent+'. Add the image and R2 settings to .env, then restart the server.');return;}
 if(!missingOnly&&slots.some(slot=>imageSrc(slot.url))&&!confirm('Generate every picture again? Existing URLs in this draft will be replaced.')){operationBusy=false;syncStudioUI();return;}
 const controls=[...document.querySelectorAll('button,input,textarea,select')];const previous=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true);
 showWorkspace('setup');$('cancelVisualsBtn').style.display='inline-block';$('cancelVisualsBtn').disabled=false;cancelImageGeneration=false;
 try{const result=await generateAllImages(false,missingOnly);saved=false;$('saveStatus').style.display='none';$('generationStatus').textContent=`${result.completed}/${result.total} pictures uploaded to R2${result.failed?' · '+result.failed+' need retry. Use Generate missing images.':''}${result.cancelled?' · stopped. Existing results are kept.':''}`;}
 catch(error){$('generationStatus').textContent=error.message;}
 finally{operationBusy=false;$('cancelVisualsBtn').style.display='none';finishBatchProgress();controls.forEach((control,index)=>control.disabled=previous[index]);syncStudioUI();queueDraftSave();}
}
function rememberStudioMapping(){
 try{saveCurriculumMapping(currentStudioMapping());observedMappingJson=localStorage.getItem(curriculumMappingStorageKey);}
 catch{$('draftStatus').textContent='Browser storage unavailable · download your draft';}
}
function currentStudioMapping(){
 return {catalog,curriculum:{grade:$('grade').value,board:$('board').value,subject:$('subject').value,topic:$('topic').value},selectedConceptIndex,objective:$('objective').value};
}
function syncSavedCurriculumMapping(){
 let raw;try{raw=localStorage.getItem(curriculumMappingStorageKey);}catch{return;}
 if(raw===observedMappingJson){mappingSyncPending=false;return;}
 if(operationBusy){mappingSyncPending=true;return;}
 const mapping=readSavedCurriculumMapping();
 const contextChanged=curriculumMappingIdentity(mapping)!==curriculumMappingIdentity(currentStudioMapping());
 if(contextChanged){queueDraftSave();flushStudioDraft();}
 const wasInitialized=studioInitialized;studioInitialized=false;mappingSyncPending=false;
 if(contextChanged){clearAuthoring();$('instructions').value='';}
 if(mapping){loadSavedCurriculumMapping();if(contextChanged)restoreStudioDraft();$('objective').value=mapping.objective;}
 else if(contextChanged){catalog={};selectedConceptIndex=0;$('topic').replaceChildren(new Option('Generate curriculum first',''));$('topic').disabled=true;resolveMappings();}
 observedMappingJson=raw;studioInitialized=wasInitialized;updatePayload();syncStudioUI();
 if(contextChanged){
  $('manualPrompt').value='';$('manualJson').value='';$('manualTopic').value='';$('manualConcept').value='';
  $('correctionPromptDetails').hidden=true;$('manualContext').textContent=$('contentContext').textContent;
  if($('manualDialog').open)showManualStep('prompt');
  showWorkspace('setup');showToast(mapping?.curriculum.topic?'Curriculum selection updated. Your prompt now uses this concept.':'Class and subject updated. Select a topic and concept in Curriculum Mapping.');
 }
}
function studioDraftKey(){
 const concept=currentConcept();return concept.name?'kidsverseStudioDraftV1:'+JSON.stringify([$('grade').value,$('board').value,$('subject').value,$('topic').value,concept.name]):null;
}
function studioDraftFields(){
 return [...document.querySelectorAll('input[id],textarea[id]')].filter(field=>!field.closest('dialog')&&!field.dataset.q&&field.id!=='manualJsonFile');
}
function queueDraftSave(){
 if(!studioInitialized)return;
 const key=studioDraftKey();if(!key)return;
 pendingDraft={key,value:{version:1,fields:Object.fromEntries(studioDraftFields().map(field=>[field.id,field.type==='checkbox'?field.checked:field.value])),questions:JSON.parse(JSON.stringify(questionData)),updatedAt:Date.now()}};
 $('draftStatus').textContent='Saving draft…';
 clearTimeout(draftTimer);draftTimer=setTimeout(flushStudioDraft,400);
}
function flushStudioDraft(){
 if(!pendingDraft)return;
 try{localStorage.setItem(pendingDraft.key,JSON.stringify(pendingDraft.value));$('draftStatus').textContent='Saved in this browser';pendingDraft=null;}
 catch{$('draftStatus').textContent='Could not save locally · download your package';}
}
function restoreStudioDraft(){
 clearTimeout(draftTimer);pendingDraft=null;
 const key=studioDraftKey();if(!key)return;
 const wasInitialized=studioInitialized;studioInitialized=false;
 try{
  const draft=JSON.parse(localStorage.getItem(key)||'null');
  if(!draft||draft.version!==1)return;
  const banks=['cfu','test','battle','challenge'];
  if(!draft.fields||!draft.questions||banks.some(bank=>!Array.isArray(draft.questions[bank])||draft.questions[bank].some(q=>!new RegExp('^'+bank+'_\\d+$').test(q.id))))throw Error('Invalid saved draft');
  for(const field of studioDraftFields())if(Object.hasOwn(draft.fields,field.id)){if(field.type==='checkbox')field.checked=!!draft.fields[field.id];else field.value=String(draft.fields[field.id]);}
  questionData=draft.questions;questionCounters=Object.fromEntries(banks.map(bank=>[bank,Math.max(0,...questionData[bank].map(q=>Number(q.id.split('_')[1])))]));
  banks.forEach(renderQuestions);updatePayload();$('draftStatus').textContent='Draft restored · saved in this browser';
 }catch{$('draftStatus').textContent='Could not restore draft · import your JSON to continue';}
 finally{studioInitialized=wasInitialized;syncStudioUI();}
}
function resetDraft(){
 if(operationBusy||!confirm('Clear the current draft? The selected concept will stay. Download your package first if you want to keep this version.'))return;
 clearAuthoring();$('objective').value=currentConcept().objective||'';$('instructions').value='';updatePayload();flushStudioDraft();showWorkspace('setup');showToast('Draft cleared. Ready for a new version.');
}
async function copyFieldValue(id){
 const field=document.getElementById(id);if(!field?.value){showToast('Add an image URL first.');return;}
 try{await navigator.clipboard.writeText(field.value);showToast('Image URL copied.');}catch{field.focus();field.select();showToast('Select and copy this URL manually.');}
}
function enhanceImageCopyButtons(){
 document.querySelectorAll('input[id$="ImageUrl"],#imageUrl,input[data-field="image_url"]').forEach(field=>{
  if(field.dataset.copyEnhanced)return;field.dataset.copyEnhanced='true';
  if(!field.id)field.id=field.dataset.q+'-image_url';
  let label=field.previousElementSibling;while(label&&label.tagName!=='LABEL')label=label.previousElementSibling;if(!label)return;
  const row=document.createElement('div');row.className='label-row';label.before(row);row.appendChild(label);label.htmlFor=field.id;
  const button=document.createElement('button');button.type='button';button.textContent='Copy URL';button.setAttribute('aria-label','Copy '+label.textContent);button.onclick=()=>copyFieldValue(field.id);row.appendChild(button);
 });
}

if(document.getElementById('workflowNext')){
 restoreStudioDraft();studioInitialized=true;syncStudioUI();enhanceImageCopyButtons();
 try{observedMappingJson=localStorage.getItem(curriculumMappingStorageKey);}catch{}
 document.addEventListener('input',event=>{if(!event.target.closest('dialog')){queueDraftSave();if(saved){saved=false;$('saveStatus').style.display='none';}}});
 document.addEventListener('change',event=>{if(event.target.id==='autoVisuals')queueDraftSave();});
 window.addEventListener('pagehide',flushStudioDraft);
 document.querySelector('.header-actions .page-link').addEventListener('click',()=>{queueDraftSave();flushStudioDraft();});
 window.addEventListener('storage',event=>{if(event.key===curriculumMappingStorageKey||event.key===null)syncSavedCurriculumMapping();});
 window.addEventListener('focus',syncSavedCurriculumMapping);window.addEventListener('pageshow',syncSavedCurriculumMapping);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncSavedCurriculumMapping();});
 const questionObserver=new MutationObserver(enhanceImageCopyButtons);['cfu','test','battle','challenge'].forEach(bank=>questionObserver.observe($(bank+'List'),{childList:true}));
 // Replace the short-lived toast so status remains readable during keyboard navigation.
 showToast=function(message){const toast=$('toast');clearTimeout(toastTimer);toast.textContent=message;toast.style.display='block';toastTimer=setTimeout(()=>toast.style.display='none',5000);};
}else{
 document.querySelectorAll('label:not([for])').forEach(label=>{const field=label.nextElementSibling;if(field?.id&&field.matches('input,textarea,select'))label.htmlFor=field.id;});
}


let gamePublishBusy=false;
let lastGamePublishedJson=null;
async function sendToGame(){
 if(gamePublishBusy||operationBusy)return;
 const snapshot=JSON.stringify(buildPayload());
 const status=$('gamePublishStatus'),button=$('sendGameBtn');
 status.scrollIntoView?.({block:'center',behavior:'smooth'});
 if(snapshot===lastGamePublishedJson){status.textContent='This package was already sent successfully. Edit the content before sending another version.';return;}
 gamePublishBusy=true;operationBusy=true;button.disabled=true;button.textContent='Sending…';button.setAttribute('aria-busy','true');
 const footerButton=document.getElementById('footerPushDb');if(footerButton){footerButton.disabled=true;footerButton.textContent='Sending…';footerButton.setAttribute('aria-busy','true');}
 status.textContent='Saving the selected curriculum and complete content package to the database…';
 try{
  const response=await fetch('/api/publish-game',{method:'POST',headers:{'Content-Type':'application/json'},body:snapshot,signal:AbortSignal.timeout(55000)});
  let result;try{result=await response.json();}catch{throw Error('Publishing is available from the local CMS. No readable confirmation received; check saved content before sending again.');}
  if(!response.ok)throw Error(result.error||'The database API did not confirm this package.');
  if(result.status!=='success'||!result.data?.package_id)throw Error('No package confirmation received. Check saved content before sending again.');
  lastGamePublishedJson=snapshot;
  const counts=result.data.questions_saved;
  status.textContent='Saved to database. Package: '+result.data.package_id+(counts?' · '+counts.total+' questions':'');
 }catch(error){status.textContent=error.name==='TimeoutError'?'No confirmation received. Check saved content before sending again.':error.message;}
 finally{gamePublishBusy=false;operationBusy=false;button.disabled=false;button.textContent='Save content to database';button.removeAttribute('aria-busy');if(footerButton){footerButton.disabled=false;footerButton.textContent='Push to DB';footerButton.removeAttribute('aria-busy');}syncStudioUI();}
}
