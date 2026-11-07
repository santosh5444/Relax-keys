import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
// In production, MASTER_SECRET is set via process.env.RELAX_KEYS_MASTER_SECRET
const MASTER_SECRET = process.env.RELAX_KEYS_MASTER_SECRET || 'relax-keys-default-secure-vault-key-2026';
const SALT = 'relax-keys-vault-salt-v1';

// Derive 32-byte key using PBKDF2
function getMasterKey() {
  return crypto.pbkdf2Sync(MASTER_SECRET, SALT, 100000, 32, 'sha256');
}

/**
 * Encrypts an API key using AES-256-GCM.
 */
export function encryptApiKey(plainKey) {
  if (!plainKey) throw new Error('API key is required for encryption');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag
  };
}

/**
 * Decrypts an API key using AES-256-GCM.
 */
export function decryptApiKey(encrypted, ivHex, tagHex) {
  if (!encrypted || !ivHex || !tagHex) {
    throw new Error('Invalid cipher payload');
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getMasterKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Safely masks a sensitive API key for UI display (e.g. sk-proj-...3aBc)
 */
export function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****' + key.slice(-4);
  const prefix = key.slice(0, 7);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Generates a safe virtual key (e.g. rk_live_...)
 */
export function generateVirtualKey() {
  const randomHex = crypto.randomBytes(16).toString('hex');
  return `rk_live_${randomHex}`;
}
