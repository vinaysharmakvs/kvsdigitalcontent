// Explicit readback from the new backend; no original DB or browser-cache fallback.
function applyLivePackage(p){
 const expected=buildPayload();
 if(!p?.curriculum||!p.concept||['grade','board','subject','topic'].some(key=>p.curriculum[key]!==expected.curriculum[key])||p.concept.name!==expected.concept.name)throw Error('This package belongs to a different selection.');
 const steps=p.learn_before_test?.steps;
 const banksToCheck=[p.check_for_understanding,p.test_questions?.questions||[],p.battle_questions,p.challenge?.questions];
 if(!Array.isArray(steps)||steps.map(s=>s.step_key).join(',')!=='understand,example,remember'||banksToCheck.some(b=>!Array.isArray(b)))throw Error('The new API returned an incomplete package.');
 const ways=steps[1].explanation_ways||[];
 if(!Array.isArray(ways)||ways.length!==2||!Array.isArray(p.learning_content?.hints)||[...steps,...ways].some(s=>!Array.isArray(s.mini_question?.options))||banksToCheck.flat().some(q=>!Array.isArray(q.options)||!Array.isArray(q.hints)))throw Error('The new API returned incomplete question or learning data. Current editor kept.');
 clearAuthoring();
 const put=(id,value)=>{if($(id))$(id).value=value??'';};
 const l=p.learning_content||{};
 for(const [id,value] of Object.entries({objective:p.concept.learning_objective,method:l.teaching_method,explanation:l.explanation,imageUrl:l.image_url,imagePrompt:l.image_prompt,nova:l.nova_script,novaFeedback:l.nova_feedback}))put(id,value);
 [1,2,3].forEach((n,i)=>put('hint'+n,l.hints?.[i]));
 function fill(prefix,item,alternate=false){
  const q=item.mini_question||{};
  const fields={Text:item.teaching_text,Key:item.key_idea,ImageUrl:item.image_url,ImagePrompt:item.image_prompt,Nova:item.nova_script,Question:q.question,Options:(q.options||[]).join(' | '),Answer:q.answer,Explanation:q.explanation};
  if(alternate){fields.Label=item.label;fields.ImageAlt=item.image_alt;}else fields.Title=item.title;
  for(const [suffix,value] of Object.entries(fields))put(prefix+suffix,value);
 }
 for(const step of p.learn_before_test.steps){const name=learningStepNames.find(n=>n.toLowerCase()===step.step_key);if(name)fill('learn'+name,step);}
 const examples=p.learn_before_test.steps.find(s=>s.step_key==='example')?.explanation_ways||[];
 examples.slice(0,2).forEach((way,i)=>fill('exampleAlt'+(i+1),way,true));
 const banks={cfu:p.check_for_understanding,test:p.test_questions?.questions||[],battle:p.battle_questions,challenge:p.challenge.questions};
 for(const [type,questions] of Object.entries(banks)){
  questionData[type]=questions.map((q,i)=>({...q,id:type+'_'+(i+1),type,options:(q.options||[]).join(' | '),hints:(q.hints||[]).join(' | '),novaFeedback:q.novaFeedback??q.nova_feedback??''}));
  questionCounters[type]=questions.length;renderQuestions(type);
 }
 updatePayload();queueDraftSave();showWorkspace('review');
 $('draftStatus').textContent='Loaded from new API · package '+p.id;
}
async function listLivePackages(){
 if(operationBusy)return;
 const status=$('liveLoadStatus'),select=$('livePackageSelect');
 const p=buildPayload();
 if(!p.concept.name){status.textContent='Select a concept in Curriculum Mapping first.';return;}
 operationBusy=true;syncStudioUI();$('listLiveBtn').disabled=true;
 status.textContent='Reading packages from the new API…';
 try{
  const params=new URLSearchParams({target:'packages',...p.curriculum});
  const r=await fetch('/api/live-content?'+params,{signal:AbortSignal.timeout(30000)});const data=await r.json();
  if(!r.ok)throw Error(data.error||'New API read failed.');
  const matches=(data.packages||[]).filter(item=>item.concept_name===p.concept.name&&item.topic_name===p.curriculum.topic&&item.subject_name===p.curriculum.subject&&item.grade===p.curriculum.grade&&item.board===p.curriculum.board);
  select.replaceChildren(...matches.map(item=>new Option((item.theme||'Default')+' · '+item.question_count+' questions · '+item.id,item.id)));
  select.disabled=!matches.length;$('loadLiveBtn').disabled=!matches.length;
  status.textContent=matches.length?matches.length+' saved packages found in the new API. Select one and load it.':'No package found in the new API for this concept.';
 }catch(error){select.replaceChildren();select.disabled=true;$('loadLiveBtn').disabled=true;status.textContent=error.message;}
 finally{operationBusy=false;$('listLiveBtn').disabled=false;syncStudioUI();}
}
async function loadLivePackage(){
 if(operationBusy||!$('livePackageSelect').value)return;
 if(!confirm('Replace the current editor with this package read from the new API?'))return;
 const status=$('liveLoadStatus');operationBusy=true;$('loadLiveBtn').disabled=true;syncStudioUI();
 status.textContent='Loading lessons, questions and hosted images from the new API…';
 try{
  const r=await fetch('/api/live-content?'+new URLSearchParams({target:'package',id:$('livePackageSelect').value}),{signal:AbortSignal.timeout(30000)});
  const p=await r.json();if(!r.ok)throw Error(p.error||'Package load failed.');
  applyLivePackage(p);status.textContent='Loaded from new API. Package: '+p.id;
 }catch(error){status.textContent=error.message;}
 finally{operationBusy=false;$('loadLiveBtn').disabled=false;syncStudioUI();}
}
