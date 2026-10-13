import {S3Client, PutObjectCommand} from '@aws-sdk/client-s3';
import {randomUUID} from 'node:crypto';

export function r2Config(env=process.env){
 const required=['CLOUDFLARE_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_PUBLIC_BASE_URL'];
 const missing=required.filter(key=>!env[key]?.trim());
 if(missing.length)throw Error('R2 setup needed: '+missing.join(', '));
 const base=new URL(env.R2_PUBLIC_BASE_URL);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||base.hostname.endsWith('.r2.cloudflarestorage.com'))throw Error('R2_PUBLIC_BASE_URL must be your HTTPS public bucket domain (not the S3 endpoint), without a path.');
 return {base:base.origin,bucket:env.R2_BUCKET_NAME,endpoint:`https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`};
}
export function storageStatus(env=process.env){
 try{r2Config(env);return {storageConfigured:true,storageMessage:'R2 upload configured'};}
 catch(error){return {storageConfigured:false,storageMessage:error.message};}
}
export async function uploadImage(data,env=process.env,client){
 const config=r2Config(env);
 if(typeof data!=='string'||data.length>28_000_000||!data.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('Invalid generated image');
 const bytes=Buffer.from(data,'base64');
 let mimeType,extension;
 if(bytes.subarray(0,3).equals(Buffer.from([255,216,255]))){mimeType='image/jpeg';extension='jpg';}
 else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){mimeType='image/png';extension='png';}
 else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){mimeType='image/webp';extension='webp';}
 else throw Error('Unsupported generated image format');
 const objectKey=`content/${new Date().toISOString().slice(0,10)}/${randomUUID()}.${extension}`;
 const owned=!client;
 client??=new S3Client({region:'auto',endpoint:config.endpoint,credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY},maxAttempts:2});
 try{
  await client.send(new PutObjectCommand({Bucket:config.bucket,Key:objectKey,Body:bytes,ContentType:mimeType,CacheControl:'public, max-age=31536000, immutable'}),{abortSignal:AbortSignal.timeout(15000)});
  return {url:`${config.base}/${objectKey}`,objectKey,mimeType};
 }finally{if(owned)client.destroy();}
}
