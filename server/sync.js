import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const SYNC_FILE = path.join(DATA_DIR, 'zero-knowledge-vaults.json');

// Ensure sync storage file exists
function loadVaults() {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveVaults(vaults) {
  try {
    fs.writeFileSync(SYNC_FILE, JSON.stringify(vaults, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save sync vaults:', err);
  }
}

/**
 * Stores an encrypted blob in zero-knowledge mode.
 * The server never sees the plaintext keys or the passphrase.
 */
export function saveEncryptedVault(vaultId, encryptedBlob, iv, salt) {
  const vaults = loadVaults();
  vaults[vaultId] = {
    vaultId,
    encryptedBlob,
    iv,
    salt,
    updatedAt: new Date().toISOString(),
    failedAttempts: 0,
    lockedUntil: 0
  };
  saveVaults(vaults);
  return { success: true };
}

/**
 * Fetches an encrypted blob with strict 5-strike rate limiting.
 */
export function fetchEncryptedVault(vaultId) {
  const vaults = loadVaults();
  const vault = vaults[vaultId];

  if (!vault) {
    return { error: 'Vault not found. Check your secret passphrase.', status: 404 };
  }

  const now = Date.now();
  if (vault.lockedUntil && vault.lockedUntil > now) {
    const minutesLeft = Math.ceil((vault.lockedUntil - now) / 60000);
    return {
      error: `Vault locked due to multiple failed attempts. Locked for another ${minutesLeft} minutes.`,
      status: 429
    };
  }

  return {
    vault: {
      encryptedBlob: vault.encryptedBlob,
      iv: vault.iv,
      salt: vault.salt,
      updatedAt: vault.updatedAt
    }
  };
}

/**
 * Records a failed decryption attempt to prevent brute force.
 */
export function recordFailedAttempt(vaultId) {
  const vaults = loadVaults();
  if (vaults[vaultId]) {
    vaults[vaultId].failedAttempts = (vaults[vaultId].failedAttempts || 0) + 1;
    if (vaults[vaultId].failedAttempts >= 5) {
      vaults[vaultId].lockedUntil = Date.now() + 60 * 60 * 1000; // Lock 1 hour
    }
    saveVaults(vaults);
  }
}

/**
 * Resets failed attempts after a successful decryption.
 */
export function recordSuccessfulSync(vaultId) {
  const vaults = loadVaults();
  if (vaults[vaultId]) {
    vaults[vaultId].failedAttempts = 0;
    vaults[vaultId].lockedUntil = 0;
    saveVaults(vaults);
  }
}
