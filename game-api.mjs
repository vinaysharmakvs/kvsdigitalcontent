// The destination and credentials stay on the CMS server.
export function gameConfig(env=process.env){
  if(!env.GAME_API_URL)throw Error('Set GAME_API_URL to the game ingestion endpoint in .env and restart.');
  const url=new URL(env.GAME_API_URL);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('GAME_API_URL must use HTTPS (HTTP is allowed for localhost).');
  if(url.username||url.password||url.hash)throw Error('Keep game credentials in GAME_API_TOKEN, not in the URL.');
  return url.href;
}

export function validateGamePackage(p){
  const text=(value,label)=>{if(typeof value!=='string'||!value.trim())throw Error('Complete '+label+'.');};
  const image=item=>{text(item?.image_url,'each image URL');let url;try{url=new URL(item.image_url);}catch{throw Error('Each picture needs a hosted HTTPS URL.');}if(url.protocol!=='https:'||/\s/.test(item.image_url))throw Error('Each picture needs a hosted HTTPS URL.');};
  const question=(q,mini=false)=>{
    text(q?.question,'each question');text(q?.explanation,'each answer explanation');
    if(!Array.isArray(q.options)||q.options.length<(mini?3:4)||q.options.length>4||!q.options.includes(q.answer)||new Set(q.options).size!==q.options.length)throw Error('Check question options and correct answers.');
    q.options.forEach(option=>text(option,'each option'));
    if(!mini){image(q);text(q.nova_script,'each question Nova script');if(!Array.isArray(q.hints)||q.hints.length!==3)throw Error('Each question needs three hints.');q.hints.forEach(h=>text(h,'each hint'));if(!['Easy','Medium','Hard'].includes(q.difficulty)||!Number.isInteger(q.xp)||q.xp<0||q.xp>100||!Number.isInteger(q.marks)||q.marks<1||q.marks>10)throw Error('Check question difficulty, XP and marks.');}
  };
  if(p?.content_type!=='concept_package')throw Error('A concept package is required.');
  for(const key of ['grade','board','subject','topic'])text(p.curriculum?.[key],key);
  text(p.concept?.name,'concept');text(p.concept?.learning_objective,'learning objective');
  image(p.learning_content);for(const key of ['teaching_method','explanation','nova_script'])text(p.learning_content[key],key);
  const lesson=p.learn_before_test;
  if(!lesson||lesson.required!==true||lesson.starts_quiz_after!=='remember'||JSON.stringify(lesson.order)!=='["understand","example","remember"]'||!Array.isArray(lesson.steps)||lesson.steps.map(s=>s.step_key).join(',')!=='understand,example,remember')throw Error('Complete the three ordered learning screens.');
  const ways=lesson.steps[1].explanation_ways;
  if(!Array.isArray(ways)||ways.length!==2)throw Error('Complete both alternate examples.');
  for(const item of [...lesson.steps,...ways]){image(item);for(const key of ['teaching_text','key_idea','nova_script'])text(item[key],key);question(item.mini_question,true);}
  const banks=[p.check_for_understanding,p.test_questions?.questions??[],p.battle_questions,p.challenge?.questions];
  if(banks.some(bank=>!Array.isArray(bank))||!banks[0].length||!banks[2].length||!banks[3].length)throw Error('Complete mission, battle and challenge questions.');
  banks.flat().forEach(q=>question(q));
  return p;
}

export async function publishGamePackage(input,env=process.env,fetcher=fetch){
  let url;try{url=gameConfig(env);}catch{return {status:503,body:{error:'Game publishing needs a valid GAME_API_URL in the CMS server settings.'}};}
  try{validateGamePackage(input);}catch(e){return {status:400,body:{error:e.message}};}
  try{
    const headers={'Content-Type':'application/json','Accept':'application/json'};
    if(env.GAME_API_TOKEN)headers.Authorization='Bearer '+env.GAME_API_TOKEN;
    // Never retry writes automatically: the game may have saved a timed-out request.
    const response=await fetcher(url,{method:'POST',headers,body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(45000)});
    if(response.status===404)return {status:502,body:{error:'Live API returned HTTP 404: the configured URL is not a content ingestion endpoint. Check the full API route.'}};
    if(response.status===401||response.status===403)return {status:502,body:{error:'Live API rejected authentication (HTTP '+response.status+'). Check the required credentials.'}};
    let body;try{body=await response.json();}catch{return {status:502,body:{error:'Live API returned a non-JSON response (HTTP '+response.status+'). Check the endpoint and saved content before sending again.'}};}
    if(!response.ok||body?.status!=='success'||!body?.data?.package_id)return {status:502,body:{error:'The game did not confirm ingestion (HTTP '+response.status+'). Check the game before sending again.'}};
    return {status:201,body:{status:'success',data:body.data}};
  }catch{return {status:502,body:{error:'No confirmation received from the game. It may have saved this package; check the game before sending again.'}};}
}
