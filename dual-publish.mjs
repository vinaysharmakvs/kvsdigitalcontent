import {ingestContent} from './content-ingestion.mjs';
import {publishGamePackage,validateGamePackage} from './game-api.mjs';

export const liveFeedUrl='https://kidsverse-apinew.vercel.app/api/v1/admin/content/feed';
export function liveEnvironment(env=process.env){
  const url=env.GAME_API_URL;
  // Replace the previously supplied API base with the route confirmed in the backend repository.
  return {...env,GAME_API_URL:!url||/^https:\/\/kidsverse-apinew\.vercel\.app\/api\/v1\/?$/.test(url)?liveFeedUrl:url};
}
export async function publishBoth(payload,env=process.env,saveOriginal=ingestContent,saveLive=publishGamePackage){
  try{validateGamePackage(payload);}catch(error){return {status:400,body:{error:error.message}};}
  const results=await Promise.allSettled([saveOriginal(payload),saveLive(payload,liveEnvironment(env))]);
  const targets={};
  for(const [index,key] of ['original','live'].entries()){
    const r=results[index].status==='fulfilled'?results[index].value:{status:503,body:{error:'No save confirmation received. Check this destination before retrying.'}};
    targets[key]={saved:r.status>=200&&r.status<300&&r.body?.status==='success',httpStatus:r.status,...(r.body?.data?{data:r.body.data}:{}),...(r.body?.error?{error:r.body.error}:{})};
  }
  const success=targets.original.saved&&targets.live.saved;
  return {status:success?201:207,body:{status:success?'success':'partial',targets,...(success?{data:targets.live.data}:{error:'Not confirmed in both databases. See each destination result.'})}};
}
