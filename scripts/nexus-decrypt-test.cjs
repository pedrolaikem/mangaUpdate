// Standalone test - decrypts a Nexus Toons API response. Do not import into app.
const crypto = require('crypto');
const https = require('https');

const SECRET = 'OrionNexus2025CryptoKey!Secure';

function deriveKeys(secret) {
  const keys = [];
  for (let n = 0; n < 5; n++) {
    const seed = `_orion_key_${n}_v2_${secret}`;
    const hash = crypto.createHash('sha256').update(seed).digest(); // 32 bytes
    keys.push(buildKey(hash));
  }
  return keys;
}

function buildKey(keyBytes) {
  const sbox = new Uint8Array(256);
  const rsbox = new Uint8Array(256);
  for (let r = 0; r < 256; r++) sbox[r] = r;
  let n = 0;
  for (let r = 0; r < 256; r++) {
    n = (n + sbox[r] + keyBytes[r % keyBytes.length]) % 256;
    const tmp = sbox[r]; sbox[r] = sbox[n]; sbox[n] = tmp;
  }
  for (let r = 0; r < 256; r++) rsbox[sbox[r]] = r;
  return { key: keyBytes, sbox, rsbox };
}

function rotateRight(b, t) {
  t = t % 8;
  return 0xff & ((b >>> t) | (b << (8 - t)));
}

function decrypt(keyObj, b64) {
  const { key, rsbox } = keyObj;
  const buf = Buffer.from(b64, 'base64');
  const o = new Uint8Array(buf);
  const out = new Uint8Array(o.length);
  const l = key.length;
  for (let c = o.length - 1; c >= 0; c--) {
    let e = o[c];
    e ^= c > 0 ? o[c - 1] : key[l - 1];
    e = rsbox[e];
    const rot = (((key[(c + 3) % l] + (c & 0xff)) & 0xff) % 7) + 1;
    e = rotateRight(e, rot);
    e ^= key[c % l];
    out[c] = e;
  }
  return Buffer.from(out).toString('utf8');
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.nexustoons.com/',
        'X-App-Key': 'NxT_s3cur3_k3y_2026!xK9mPqL',
      },
    }, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

(async () => {
  const keys = deriveKeys(SECRET);
  const r = await get('https://www.nexustoons.com/api/manga/solo-leveling');
  console.log('HTTP', r.status, 'len', r.body.length);
  const payload = JSON.parse(r.body);
  console.log('k=', payload.k, 'v=', payload.v);
  const idx = payload.v === 1 ? 0 : (payload.k || 0);
  const plain = decrypt(keys[idx], payload.d);
  const data = JSON.parse(plain);
  console.log('--- top-level keys ---');
  console.log(Object.keys(data));
  console.log('--- title/info sample ---');
  console.log(JSON.stringify(data, null, 2).slice(0, 2000));
})();
