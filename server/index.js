import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { encryptApiKey, maskApiKey, generateVirtualKey } from './crypto.js';
import { handleProxyRequest } from './proxy.js';
import { runSimulation } from './simulator.js';
import { probeApiKey, detectProvider } from './probe.js';
import { saveEncryptedVault, fetchEncryptedVault, recordFailedAttempt, recordSuccessfulSync } from './sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Request logging middleware for console debugging
app.use((req, res, next) => {
  if (!req.url.startsWith('/api/telemetry') && !req.url.startsWith('/api/metrics')) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.url}`);
  }
  next();
});

// -------------------------------------------------------------
// Core Drop-in AI Proxy Endpoints
// -------------------------------------------------------------

// OpenAI Compatible drop-in endpoint: /v1/chat/completions
app.post('/v1/chat/completions', (req, res) => {
  handleProxyRequest(req, res, null);
});

// List models endpoint
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'gpt-4o', object: 'model', owned_by: 'openai' },
      { id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' },
      { id: 'claude-3-5-sonnet', object: 'model', owned_by: 'anthropic' },
      { id: 'llama-3.3-70b-versatile', object: 'model', owned_by: 'groq' },
      { id: 'deepseek-chat', object: 'model', owned_by: 'deepseek' }
    ]
  });
});

// Universal Proxy Endpoint for any provider: /proxy/:provider
app.use('/proxy/:provider', (req, res) => {
  const provider = req.params.provider;
  handleProxyRequest(req, res, provider);
});

// -------------------------------------------------------------
// Management & Dashboard REST APIs
// -------------------------------------------------------------

// Live Metrics & Aggregations
app.get('/api/metrics', (req, res) => {
  res.json(db.getAggregatedMetrics());
});

// Keys Vault CRUD
app.get('/api/keys', (req, res) => {
  res.json(db.getAllKeys());
});

// Auto-Probe endpoint (detects provider, checks validity, extracts rate limits & balances)
app.post('/api/keys/probe', async (req, res) => {
  const { rawKey, provider, baseUrl } = req.body || {};
  if (!rawKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  const probeResult = await probeApiKey(rawKey, provider, baseUrl);
  res.json(probeResult);
});

// Re-check all saved keys in 1-click
app.post('/api/keys/recheck-all', async (req, res) => {
  const keys = db.getAllKeys();
  const results = [];
  for (const k of keys) {
    if (k.encryptedKey && k.iv && k.tag) {
      try {
        const plainKey = decryptApiKey(k.encryptedKey, k.iv, k.tag);
        const probe = await probeApiKey(plainKey, k.provider);
        const updated = db.updateKey(k.id, {
          status: probe.status,
          rpmLimit: probe.rpmLimit,
          tpmLimit: probe.tpmLimit,
          quotaStatus: probe.quotaStatus,
          availableModels: probe.availableModels || k.availableModels,
          currentBalance: probe.hasRealBalance ? probe.balance : k.currentBalance,
          lastCheckedAt: new Date().toISOString()
        });
        results.push(updated);
      } catch (err) {
        results.push(k);
      }
    } else {
      results.push(k);
    }
  }
  res.json(results);
});

// Clear all demo/sample keys for a clean production slate
app.post('/api/keys/clear-demo', (req, res) => {
  db.clearAllKeys();
  res.json({ success: true, message: 'Vault reset to clean production state' });
});

// -------------------------------------------------------------
// Zero-Knowledge Cross-Device Sync Endpoints (Immune to AI Cracking)
// -------------------------------------------------------------

app.post('/api/sync/save', (req, res) => {
  const { vaultId, encryptedBlob, iv, salt } = req.body || {};
  if (!vaultId || !encryptedBlob || !iv || !salt) {
    return res.status(400).json({ error: 'Missing encrypted vault parameters' });
  }
  const result = saveEncryptedVault(vaultId, encryptedBlob, iv, salt);
  res.json(result);
});

app.post('/api/sync/fetch', (req, res) => {
  const { vaultId } = req.body || {};
  if (!vaultId) {
    return res.status(400).json({ error: 'Vault ID is required' });
  }
  const result = fetchEncryptedVault(vaultId);
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  res.json(result.vault);
});

app.post('/api/sync/failed', (req, res) => {
  const { vaultId } = req.body || {};
  if (vaultId) recordFailedAttempt(vaultId);
  res.json({ success: true });
});

app.post('/api/sync/success', (req, res) => {
  const { vaultId } = req.body || {};
  if (vaultId) recordSuccessfulSync(vaultId);
  res.json({ success: true });
});

app.post('/api/keys', (req, res) => {
  const { provider, label, rawKey, balance, expiresAt, rpmLimit, tpmLimit, availableModels } = req.body;
  
  if (!provider || !label || !rawKey) {
    return res.status(400).json({ error: 'Provider, label, and raw key are required' });
  }

  // Encrypt with AES-256-GCM
  const { encrypted, iv, tag } = encryptApiKey(rawKey);
  const maskedKey = maskApiKey(rawKey);

  const initialBalance = parseFloat(balance) || 20.00;
  const newKey = {
    id: `key_${provider}_${Date.now()}`,
    provider: provider.toLowerCase(),
    label,
    encryptedKey: encrypted,
    iv,
    tag,
    maskedKey,
    initialBalance,
    currentBalance: initialBalance,
    currency: 'USD',
    expiresAt: expiresAt || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'healthy',
    cooldownUntil: 0,
    rpmLimit: parseInt(rpmLimit, 10) || 500,
    tpmLimit: parseInt(tpmLimit, 10) || 30000,
    availableModels: Array.isArray(availableModels) ? availableModels : [],
    rateLimitState: {
      rpmRemaining: parseInt(rpmLimit, 10) || 500,
      tpmRemaining: parseInt(tpmLimit, 10) || 30000,
      resetTime: null
    },
    createdAt: new Date().toISOString()
  };

  db.saveKey(newKey);
  res.status(201).json(newKey);
});

app.put('/api/keys/:id', (req, res) => {
  const updated = db.updateKey(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Key not found' });
  res.json(updated);
});

app.delete('/api/keys/:id', (req, res) => {
  db.deleteKey(req.params.id);
  res.json({ success: true });
});

app.post('/api/keys/:id/reset-cooldown', (req, res) => {
  const key = db.getKeyById(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key not found' });
  
  db.updateKey(req.params.id, {
    cooldownUntil: 0,
    status: 'healthy',
    lastCooldownReason: null
  });
  res.json({ success: true, message: `Cooldown reset for ${key.label}` });
});

// Virtual Keys CRUD (The Shield)
app.get('/api/virtual-keys', (req, res) => {
  res.json(db.getAllVirtualKeys());
});

app.post('/api/virtual-keys', (req, res) => {
  const { name, targetProvider, dailySpendLimit } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const newVKey = {
    id: `vkey_${Date.now()}`,
    key: generateVirtualKey(),
    name,
    targetProvider: (targetProvider || 'openai').toLowerCase(),
    dailySpendLimit: parseFloat(dailySpendLimit) || 10.00,
    spentToday: 0.00,
    resetDayDate: new Date().toISOString().split('T')[0],
    isActive: true,
    createdAt: new Date().toISOString()
  };

  db.saveVirtualKey(newVKey);
  res.status(201).json(newVKey);
});

app.delete('/api/virtual-keys/:id', (req, res) => {
  db.deleteVirtualKey(req.params.id);
  res.json({ success: true });
});

// Telemetry Stream
app.get('/api/telemetry', (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  res.json(db.getTelemetryLogs(limit));
});

// Simulator Trigger
app.post('/api/simulate', (req, res) => {
  try {
    const result = runSimulation(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Relax Keys Gateway', version: '1.0.0' });
});

// Serve static client assets if built
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/v1') || req.url.startsWith('/proxy')) {
    return next();
  }
  const indexPath = path.join(clientDist, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🔑 RELAX KEYS GATEWAY RUNNING ON http://localhost:${PORT}`);
  console.log(`  • OpenAI Drop-in URL : http://localhost:${PORT}/v1`);
  console.log(`  • Universal Proxy    : http://localhost:${PORT}/proxy/:provider/*`);
  console.log(`  • REST APIs          : http://localhost:${PORT}/api/metrics`);
  console.log(`======================================================\n`);
});
