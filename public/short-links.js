const API='https://barogil-route-api.hkkim0454.workers.dev';
const cached=new Map();
export async function shortenLink(url,request=fetch) {
  if(cached.has(url))return cached.get(url);
  const pending=(async()=>{
    const response=await request(API+'/links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(response.status===404?'짧은 링크 서버 업데이트가 필요합니다.':'짧은 링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const data=await response.json();if(!/^[a-f0-9]{20}$/.test(data.id))throw new Error('공유 링크 응답을 확인해 주세요.');
    return API+'/s/'+data.id;
  })();cached.set(url,pending);
  try{return await pending;}catch(error){cached.delete(url);throw error;}
}
export async function expandLink(url,request=fetch) {
  const parsed=new URL(url);if(parsed.origin!==API||!/^\/s\/[a-f0-9]{20}$/.test(parsed.pathname))return url;
  const response=await request(API+'/links/'+parsed.pathname.split('/').pop(),{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('모임 링크를 불러오지 못했습니다.');
  const data=await response.json();const target=new URL(data.url);if(target.origin!=='https://hkkim0454.github.io'||target.pathname!=='/kakaotmap/')throw new Error('올바른 모임 링크가 아닙니다.');return target.href;
}
