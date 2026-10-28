// Shared browser storage contract for Curriculum Mapping and Content Studio.
const curriculumMappingStorageKey='kidsverseNewApiMappingV1';
function curriculumContextKey(context){
 return 'kidsverseNewApiCatalogV1:'+JSON.stringify(['grade','board','subject'].map(key=>context[key]));
}
function normalizeCurriculumMapping(value){
 if(!value?.curriculum||['grade','board','subject'].some(key=>typeof value.curriculum[key]!=='string'||!value.curriculum[key].trim()||value.curriculum[key].length>200))return null;
 const context=Object.fromEntries(['grade','board','subject'].map(key=>[key,value.curriculum[key]]));
 const entries=Object.entries(value.catalog||{}).filter(([name,concepts])=>name.trim()&&name.length<=200&&Array.isArray(concepts)&&concepts.length&&concepts.every(concept=>typeof concept?.name==='string'&&concept.name.trim()&&concept.name.length<=200&&typeof concept.objective==='string'));
 const normalizedCatalog=Object.fromEntries(entries);
 const topic=Object.hasOwn(normalizedCatalog,value.curriculum.topic)?value.curriculum.topic:'';
 const concepts=normalizedCatalog[topic]||[];
 const index=Math.max(0,Math.min(Number.isInteger(value.selectedConceptIndex)?value.selectedConceptIndex:0,Math.max(0,concepts.length-1)));
 return {version:2,catalog:normalizedCatalog,curriculum:{...context,topic},selectedConceptIndex:index,objective:concepts.length?(typeof value.objective==='string'?value.objective:concepts[index].objective):''};
}
function readSavedCurriculumMapping(){
 try{return normalizeCurriculumMapping(JSON.parse(localStorage.getItem(curriculumMappingStorageKey)||'null'));}catch{return null;}
}
function readCurriculumContext(context){
 try{
  const value=normalizeCurriculumMapping(JSON.parse(localStorage.getItem(curriculumContextKey(context))||'null'));
  return value&&['grade','board','subject'].every(key=>value.curriculum[key]===context[key])?value:null;
 }catch{return null;}
}
function saveCurriculumMapping(value){
 const mapping=normalizeCurriculumMapping(value);if(!mapping)throw Error('Choose a class, board and subject first.');
 const json=JSON.stringify(mapping);
 if(mapping.curriculum.topic)localStorage.setItem(curriculumContextKey(mapping.curriculum),json);
 localStorage.setItem(curriculumMappingStorageKey,json);
 return mapping;
}
function curriculumMappingIdentity(value){
 const mapping=normalizeCurriculumMapping(value);if(!mapping)return '';
 const context=mapping.curriculum;
 return JSON.stringify([context.grade,context.board,context.subject,context.topic,mapping.catalog[context.topic]?.[mapping.selectedConceptIndex]?.name||'']);
}
