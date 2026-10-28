let databaseVersion=null,databaseContext='',databaseSequence=0,databaseBusy=false;
const contextKey=()=>JSON.stringify(mappingContext());
function dbControls(){
 $('saveDatabaseBtn').disabled=databaseBusy||mappingBusy||databaseVersion===null||!Object.keys(catalog).length;
 $('loadDatabaseBtn').disabled=databaseBusy||mappingBusy;
}
function keepObjective(){const c=current();if(c.name)c.objective=$('objective').value;}
async function loadDatabaseMapping(explicit=false){
 if(mappingBusy||databaseBusy&&explicit)return;
 const key=contextKey(),sequence=++databaseSequence;databaseContext=key;databaseVersion=null;dbControls();
 $('pushStatus').textContent='Checking saved curriculum in Neon…';
 try{
  const response=await fetch('/api/curricula?'+new URLSearchParams(mappingContext()),{signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load curriculum');
  if(sequence!==databaseSequence||key!==contextKey()||mappingBusy)return;
  databaseVersion=data.mapping?.version||0;
  if(!data.mapping){$('pushStatus').textContent='No database mapping yet. Generate or import topics, review, then save the entire curriculum.';return;}
  if(Object.keys(catalog).length&&!explicit){$('pushStatus').textContent=`Database version ${databaseVersion} available. Your browser draft is preserved; click Load from database to use the saved mapping.`;return;}
  if(explicit&&Object.keys(catalog).length&&!confirm('Replace the mapping on this page with the saved database version?'))return;
  const record=data.mapping,first=record.topics[0];
  applyCurriculumMapping({catalog:Object.fromEntries(record.topics.map(t=>[t.name,t.concepts])),curriculum:{...mappingContext(),topic:first.name},selectedConceptIndex:0,objective:first.concepts[0].objective});
  $('status').textContent=`${record.topics.length} topics loaded from database`;
  $('pushStatus').textContent=`Loaded version ${record.version}. No Gemini request was needed.`;
 }catch(error){if(sequence===databaseSequence)$('pushStatus').textContent=error.name==='TimeoutError'?'Database request timed out. Try Load from database again.':error.message;}
 finally{if(sequence===databaseSequence)dbControls();}
}
async function saveDatabaseMapping(){
 if(mappingBusy||databaseBusy)return;
 if(databaseVersion===null||databaseContext!==contextKey()){ $('pushStatus').textContent='Load the database status before saving.';return;}
 keepObjective();const topics=Object.entries(catalog).map(([name,concepts])=>({name,concepts:concepts.map(c=>({name:c.name,objective:c.objective}))}));
 if(!topics.length){$('pushStatus').textContent='Generate or import a curriculum first.';return;}
 if(databaseVersion>0&&!confirm('Save this entire mapping as a new database version? The previous version will be retained.'))return;
 const controls=[...document.querySelectorAll('button,select,textarea')],prior=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);databaseBusy=true;mappingBusy=true;
 $('pushStatus').textContent='Saving all topics and concepts to Neon…';
 try{
  const response=await fetch('/api/curricula',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...mappingContext(),topics,source:'manual',expectedVersion:databaseVersion}),signal:AbortSignal.timeout(120000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Save failed');databaseVersion=data.version;saveLocal();
  $('pushStatus').textContent=`Saved version ${data.version}: ${topics.length} topics and ${topics.reduce((n,t)=>n+t.concepts.length,0)} concepts. Available for future visits.`;
 }catch(error){$('pushStatus').textContent=error.name==='TimeoutError'?'Save confirmation timed out. Load from database to check whether it completed before retrying.':error.message;}
 finally{databaseBusy=false;mappingBusy=false;controls.forEach((c,i)=>c.disabled=prior[i]);syncMappingControls();dbControls();}
}
$('objective').addEventListener('input',keepObjective);
['grade','board','subject'].forEach(id=>$(id).addEventListener('change',()=>loadDatabaseMapping()));
// Rendering can add a newly generated or imported mapping after the initial database check.
const originalMappingSync=syncMappingControls;
syncMappingControls=function(){originalMappingSync();dbControls();};
loadDatabaseMapping();
