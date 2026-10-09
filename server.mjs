import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';

const publicDirectory = new URL('./public/', import.meta.url);
const assets = new Map([['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/app.js','app.js'],['/navigation.js','navigation.js']]);
const types = {html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8'};
export function createAppServer({kakaoJavascriptKey = process.env.KAKAO_JAVASCRIPT_KEY || ''} = {}) {
  return createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Cache-Control','no-store');
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{'Allow':'GET, HEAD'}); res.end(); return; }
    let path;
    try { path = new URL(req.url,'http://localhost').pathname; } catch { res.writeHead(400); res.end(); return; }
    if (path === '/config.json') {
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({kakaoJavascriptKey})); return;
    }
    const asset = assets.get(path);
    if (!asset) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const data = await readFile(new URL(asset,publicDirectory));
      res.writeHead(200,{'Content-Type':types[asset.split('.').pop()]});
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(500); res.end('Unable to load page'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `${port}번 포트가 사용 중입니다. .env에서 PORT를 변경하세요.` : error.message); process.exitCode = 1; });
  server.listen(port,'0.0.0.0',() => {
    console.log(`바로길: http://localhost:${port}`);
    for (const network of Object.values(networkInterfaces()).flat()) {
      if (network.family === 'IPv4' && !network.internal) console.log(`같은 Wi-Fi의 휴대폰: http://${network.address}:${port}`);
    }
  });
}
