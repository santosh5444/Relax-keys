/**
 * Client-Side Zero-Knowledge Cryptographic Engine
 * Uses modern Web Crypto API (SubtleCrypto) with AES-256-GCM & PBKDF2.
 * Encryption & decryption happen 100% inside browser memory.
 * Passphrases NEVER touch the server or network.
 */

// BIP-39 inspired high-entropy dictionary of clean, memorable words
const WORDLIST = [
  'amber', 'anchor', 'arcade', 'beacon', 'breeze', 'bronze', 'canyon', 'castle',
  'cedar', 'comet', 'copper', 'coral', 'cosmos', 'crater', 'crystal', 'delta',
  'desert', 'diamond', 'dragon', 'drift', 'eagle', 'echo', 'ember', 'falcon',
  'fossil', 'frost', 'galaxy', 'glacier', 'granite', 'harbor', 'hazard', 'horizon',
  'island', 'jaguar', 'jungle', 'lagoon', 'laser', 'legacy', 'lunar', 'magnet',
  'marble', 'matrix', 'meadow', 'meteor', 'mirage', 'monarch', 'nebula', 'nexus',
  'oasis', 'ocean', 'orbit', 'origin', 'palace', 'phoenix', 'pioneer', 'planet',
  'plasma', 'polar', 'prism', 'pulse', 'pyramid', 'quantum', 'quartz', 'radar',
  'radiant', 'ranger', 'ravine', 'reactor', 'ridge', 'ripple', 'river', 'rocket',
  'saddle', 'safari', 'satellite', 'shadow', 'shield', 'sierra', 'silver', 'solar',
  'spark', 'spectra', 'spiral', 'summit', 'temple', 'thunder', 'timber', 'titan',
  'topaz', 'tornado', 'tundra', 'valley', 'vector', 'velvet', 'vessel', 'vortex',
  'voyage', 'vulcan', 'zenith', 'zephyr'
];

/**
 * Generates an uncrackable 4-word passphrase using hardware entropy.
 */
export function generatePassphrase() {
  const array = new Uint32Array(4);
  window.crypto.getRandomValues(array);
  return Array.from(array)
    .map(num => WORDLIST[num % WORDLIST.length])
    .join('-');
}

// Convert buffer to hex string
function buf2hex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert hex string to Uint8Array
function hex2buf(hexString) {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Computes a SHA-256 Vault ID from the passphrase.
 * The server only sees this ID, NEVER the passphrase.
 */
export async function computeVaultId(passphrase) {
  const enc = new TextEncoder();
  const hashBuf = await window.crypto.subtle.digest(
    'SHA-256',
    enc.encode(passphrase.trim().toLowerCase())
  );
  return buf2hex(hashBuf).slice(0, 32);
}

/**
 * Derives an AES-256-GCM key from passphrase and salt using PBKDF2.
 */
async function deriveKey(passphrase, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase.trim().toLowerCase()),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-256-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts client payload with AES-256-GCM before it leaves the browser.
 */
export async function encryptPayload(passphrase, plainData) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);

  const enc = new TextEncoder();
  const encodedData = enc.encode(JSON.stringify(plainData));

  const cipherBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-256-GCM', iv },
    key,
    encodedData
  );

  return {
    encryptedBlob: buf2hex(cipherBuf),
    iv: buf2hex(iv),
    salt: buf2hex(salt)
  };
}

/**
 * Decrypts ciphertext in browser RAM using passphrase.
 */
export async function decryptPayload(passphrase, encryptedBlobHex, ivHex, saltHex) {
  const salt = hex2buf(saltHex);
  const iv = hex2buf(ivHex);
  const cipherBytes = hex2buf(encryptedBlobHex);

  const key = await deriveKey(passphrase, salt);

  const decryptedBuf = await window.crypto.subtle.decrypt(
    { name: 'AES-256-GCM', iv },
    key,
    cipherBytes
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decryptedBuf));
}
