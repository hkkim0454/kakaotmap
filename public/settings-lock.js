// Client-side accident prevention, not server-side access control.
export async function verifySettingsPassword(password,config) {
  if (!password || !config || !/^[a-f0-9]{32}$/.test(config.salt) || !/^[a-f0-9]{64}$/.test(config.hash) || config.iterations !== 210000) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(config.salt),iterations:config.iterations,hash:'SHA-256'},key,256);
  const digest = Array.from(new Uint8Array(bits),byte=>byte.toString(16).padStart(2,'0')).join('');
  return digest === config.hash;
}
export function validJavascriptKey(value) { return typeof value === 'string' && /^[a-fA-F0-9]{32}$/.test(value); }
