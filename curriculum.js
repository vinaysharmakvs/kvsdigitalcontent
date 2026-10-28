const $=id=>document.getElementById(id);
let catalog={};let selected=0;let mappingBusy=false;
function current(){return (catalog[$('topic').value]||[])[selected]||{name:'',objective:''};}
function mappingContext(){return Object.fromEntries(['grade','board','subject'].map(id=>[id,$(id).value]));}
function syncMappingControls(){
 for(const id of ['openStudioBtn','headerOpenStudioBtn'])$(id).disabled=mappingBusy||!current().name;
 $('saveMappingBtn').disabled=mappingBusy;
}
function saveLocal(){
 try{
  saveCurriculumMapping({catalog,curriculum:{...mappingContext(),topic:$('topic').value},selectedConceptIndex:selected,objective:$('objective').value});
  $('mappingSaveStatus').textContent='Saved in this browser · '+Object.values(mappingContext()).join(' · ')+(current().name?' · '+current().name:' · choose a topic and concept next');
  return true;
 }catch{$('mappingSaveStatus').textContent='Could not save this selection. Enable browser storage and try again.';return false;}
}
function saveMappingSelection(){saveLocal();syncMappingControls();}
function renderCurrent(preserveObjective=false){
 const concept=current();if(!preserveObjective)$('objective').value=concept.objective||'';
 $('mapped').textContent=concept.name||'Mapped concept';
 $('meta').textContent=concept.name?`${$('grade').value} · ${$('board').value} · ${$('subject').value} · ${$('topic').value}`:'Generate or import topics and concepts for this selection.';
 saveLocal();syncMappingControls();
}
function renderConcepts(){
 const list=catalog[$('topic').value]||[];
 $('concept').replaceChildren(...(list.length?list.map((concept,index)=>new Option(concept.name,index)):[new Option('Choose a topic first','')]));
 $('concept').disabled=!list.length;selected=0;renderCurrent();
}
function applyCurriculumMapping(mapping){
 catalog=mapping?.catalog||{};selected=mapping?.selectedConceptIndex||0;
 if(mapping)for(const id of ['grade','board','subject'])$(id).value=mapping.curriculum[id];
 const topics=Object.keys(catalog);
 $('topic').replaceChildren(...(topics.length?topics.map(name=>new Option(name,name)):[new Option('Generate curriculum first','')]));
 $('topic').value=mapping?.curriculum.topic||'';$('topic').disabled=!topics.length;
 const concepts=catalog[$('topic').value]||[];
 $('concept').replaceChildren(...(concepts.length?concepts.map((concept,index)=>new Option(concept.name,index)):[new Option('Choose a topic first','')]));
 $('concept').value=concepts.length?String(selected):'';$('concept').disabled=!concepts.length;
 $('objective').value=mapping?.objective||'';renderCurrent(true);
}
function restoreCurriculumMapping(){
 const mapping=readSavedCurriculumMapping();if(mapping)applyCurriculumMapping(mapping);else syncMappingControls();
 $('status').textContent=current().name?'Mapping restored · save and open Content Studio':'Choose class, board and subject, then generate or import topics';
}
function changeCurriculumContext(){
 applyCurriculumMapping(readCurriculumContext(mappingContext()));
 $('status').textContent=current().name?'Saved mapping restored for this selection':'Selection saved · generate or import topics and concepts';
}
async function generateCurriculum(){
 if(mappingBusy)return;mappingBusy=true;
 const controls=[...document.querySelectorAll('button,select,textarea')];const prior=controls.map(control=>control.disabled);
 controls.forEach(control=>control.disabled=true);$('status').textContent='Generating topics and concepts…';
 try{
  const response=await fetch('/api/curriculum',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mappingContext()),signal:AbortSignal.timeout(360000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Generation failed');
  catalog=Object.fromEntries(data.topics.map(topic=>[topic.name,topic.concepts]));
  $('topic').replaceChildren(...data.topics.map(topic=>new Option(topic.name,topic.name)));$('topic').disabled=false;
  renderConcepts();$('status').textContent=`${data.topics.length} topics generated · select a concept, then save and open Content Studio`;
 }catch(error){$('status').textContent=error.name==='TimeoutError'?'Generation timed out. Try again or continue with ChatGPT.':error.message;}
 finally{
  mappingBusy=false;controls.forEach((control,index)=>control.disabled=prior[index]);
  $('topic').disabled=!Object.keys(catalog).length;$('concept').disabled=!current().name;syncMappingControls();
 }
}
function saveAndOpen(){
 if(mappingBusy)return;
 if(!current().name){$('mappingSaveStatus').textContent='Generate or import topics and select a concept before opening Content Studio.';return;}
 if(saveLocal())location.href='/?studio=1';
}
function initializeCurriculumMapping(){
 ['grade','board','subject'].forEach(id=>$(id).addEventListener('change',changeCurriculumContext));
 $('topic').addEventListener('change',renderConcepts);
 $('concept').addEventListener('change',()=>{selected=Number($('concept').value);renderCurrent();});
 $('objective').addEventListener('input',saveLocal);
 restoreCurriculumMapping();
}
initializeCurriculumMapping();
