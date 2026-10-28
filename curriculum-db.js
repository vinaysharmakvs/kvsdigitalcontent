let databaseVersion=null,databaseContext='',databaseSequence=0,databaseBusy=false;
const contextKey=()=>JSON.stringify(mappingContext());
function dbControls(){
 $('saveDatabaseBtn').disabled=true;
 $('saveDatabaseBtn').title='The new API saves selected curriculum with a complete content package via Push to DB.';
 $('loadDatabaseBtn').disabled=databaseBusy||mappingBusy;
}
function keepObjective(){const c=current();if(c.name)c.objective=$('objective').value;}
async function loadDatabaseMapping(explicit=false){
 if(mappingBusy||databaseBusy&&explicit)return;
 const key=contextKey(),sequence=++databaseSequence;databaseContext=key;databaseVersion=null;dbControls();
 $('pushStatus').textContent='Loading curriculum from the new API…';
 try{
  const response=await fetch('/api/live-content?target=tree&'+new URLSearchParams(mappingContext()),{signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load curriculum');
  if(sequence!==databaseSequence||key!==contextKey()||mappingBusy)return;
  databaseVersion=data.mapping?.version||0;
  if(!data.mapping){$('pushStatus').textContent='No mapping found in the new API. Generate/import a draft, then publish a complete content package.';return;}
  if(Object.keys(catalog).length&&!explicit){$('pushStatus').textContent=`New API mapping available. Your browser draft is preserved; click Load from new API to use the saved mapping.`;return;}
  if(explicit&&Object.keys(catalog).length&&!confirm('Replace the mapping on this page with the saved database version?'))return;
  const record=data.mapping,first=record.topics[0];
  applyCurriculumMapping({catalog:Object.fromEntries(record.topics.map(t=>[t.name,t.concepts])),curriculum:{...mappingContext(),topic:first.name},selectedConceptIndex:0,objective:first.concepts[0].objective});
  $('status').textContent=`${record.topics.length} topics loaded from new API`;
  $('pushStatus').textContent=`Loaded directly from new API. No Gemini request was needed.`;
 }catch(error){if(sequence===databaseSequence)$('pushStatus').textContent=error.name==='TimeoutError'?'Database request timed out. Try Load from database again.':error.message;}
 finally{if(sequence===databaseSequence)dbControls();}
}
async function saveDatabaseMapping(){
 $('pushStatus').textContent='Old DB saving is disabled. Open Content Studio and push a complete package to the new API.';
}
$('objective').addEventListener('input',keepObjective);
['grade','board','subject'].forEach(id=>$(id).addEventListener('change',()=>loadDatabaseMapping()));
// Rendering can add a newly generated or imported mapping after the initial database check.
const originalMappingSync=syncMappingControls;
syncMappingControls=function(){originalMappingSync();dbControls();};
loadDatabaseMapping();
