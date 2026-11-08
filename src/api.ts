const endpoint = import.meta.env.VITE_SUPABASE_FUNCTION_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const TOKEN_KEY = 'pole-tracker-session';
export function getToken(){ return sessionStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(v:string){ sessionStorage.setItem(TOKEN_KEY,v); }
export function clearToken(){ sessionStorage.removeItem(TOKEN_KEY); }
export async function api(action:string, body:Record<string,unknown>={}, method='POST'){
  if(!endpoint || !key) throw new Error('The app has not been connected to Supabase yet. Follow the setup guide.');
  const url=method==='GET'?`${endpoint}?${new URLSearchParams({action,...Object.fromEntries(Object.entries(body).map(([k,v])=>[k,String(v)]))})}`:endpoint;
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json','apikey':key,'Authorization':`Bearer ${getToken() || key}`},body:method==='GET'?undefined:JSON.stringify({action,...body})});
  const data=await response.json().catch(()=>({error:'Unexpected server response'}));
  if(!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
