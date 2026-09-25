// Web Push (RFC 8291/8292) using Node's built-in crypto and HTTPS modules.
const crypto = require('crypto');
const https = require('https');

const b64 = value => Buffer.from(value).toString('base64url');
const from64 = value => Buffer.from(value, 'base64url');
const hkdf = (secret, salt, info, length) => Buffer.from(crypto.hkdfSync('sha256', secret, salt, info, length));

function generateKeys() {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKey = pair.publicKey.export({ format: 'jwk' });
  const privateKey = pair.privateKey.export({ format: 'jwk' });
  return { publicKey: b64(Buffer.concat([Buffer.from([4]), from64(publicKey.x), from64(publicKey.y)])), privateKey };
}

function send(subscription, data, keys, subject) {
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== 'https:') throw Error('Push endpoint must use HTTPS');
  const host = endpoint.hostname.toLowerCase();
  if (!['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(host)
      && !host.endsWith('.notify.windows.com') && !host.endsWith('.push.apple.com')) {
    throw Error('Unrecognized browser push endpoint');
  }
  const receiver = from64(subscription.keys.p256dh);
  const auth = from64(subscription.keys.auth);
  if (receiver.length !== 65 || receiver[0] !== 4 || auth.length < 16) throw Error('Invalid push subscription');

  const ephemeral = crypto.createECDH('prime256v1');
  const sender = ephemeral.generateKeys();
  const shared = ephemeral.computeSecret(receiver);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), receiver, sender]);
  const ikm = hkdf(shared, auth, info, 32);
  const salt = crypto.randomBytes(16);
  const key = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, nonce);
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(data)), Buffer.from([2])]);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4); recordSize.writeUInt32BE(4096);
  const body = Buffer.concat([salt, recordSize, Buffer.from([sender.length]), sender, ciphertext]);

  const header = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64(JSON.stringify({ aud: endpoint.origin, exp: Math.floor(Date.now() / 1000) + 3600, sub: subject }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), { key: crypto.createPrivateKey({ key: keys.privateKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  const jwt = `${signingInput}.${b64(signature)}`;
  return new Promise((resolve, reject) => {
    const request = https.request(endpoint, {
      method: 'POST', timeout: 8000,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': body.length,
        TTL: '86400',
        Authorization: `vapid t=${jwt}, k=${keys.publicKey}`
      }
    }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('timeout', () => request.destroy(Error('Push request timed out')));
    request.on('error', reject);
    request.end(body);
  });
}

module.exports = { generateKeys, send };
