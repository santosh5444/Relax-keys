import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'relaxkeys-store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Clean production state without dummy seed keys
const CLEAN_STATE = {
  keys: [],
  virtualKeys: [
    {
      id: 'vkey_default',
      key: 'rk_live_production_shield',
      name: 'Default Virtual Shield',
      targetProvider: 'openai',
      dailySpendLimit: 15.00,
      spentToday: 0.00,
      resetDayDate: new Date().toISOString().split('T')[0],
      isActive: true,
      createdAt: new Date().toISOString()
    }
  ],
  telemetryLogs: []
};

class Database {
  constructor() {
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(data);
      } else {
        this.data = JSON.parse(JSON.stringify(CLEAN_STATE));
        this.save();
      }
    } catch {
      this.data = JSON.parse(JSON.stringify(CLEAN_STATE));
      this.save();
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save database:', err);
    }
  }

  getAllKeys() {
    const now = Date.now();
    return (this.data.keys || []).map(key => {
      const isCooldown = key.cooldownUntil && key.cooldownUntil > now;
      let computedStatus = key.status;
      if (isCooldown) {
        computedStatus = 'cooling_down';
      } else if (key.currentBalance <= 0) {
        computedStatus = 'exhausted';
      } else if (key.currentBalance <= 5.0) {
        computedStatus = 'low_balance';
      } else {
        computedStatus = 'healthy';
      }
      return { ...key, status: computedStatus };
    });
  }

  getKeyById(id) {
    return this.getAllKeys().find(k => k.id === id);
  }

  getActiveKeyForProvider(provider = 'openai') {
    const now = Date.now();
    const candidateKeys = (this.data.keys || []).filter(k => 
      k.provider.toLowerCase() === provider.toLowerCase() &&
      (!k.cooldownUntil || k.cooldownUntil <= now) &&
      k.currentBalance > 0
    );

    if (candidateKeys.length === 0) {
      const inCooldown = (this.data.keys || []).find(k => 
        k.provider.toLowerCase() === provider.toLowerCase() &&
        k.cooldownUntil > now
      );
      if (inCooldown) {
        const remainingSeconds = Math.ceil((inCooldown.cooldownUntil - now) / 1000);
        throw new Error(`All keys for ${provider} are in cooldown (resets in ${remainingSeconds}s)`);
      }
      throw new Error(`No active keys configured for provider: ${provider}. Add one in your vault.`);
    }

    return candidateKeys.sort((a, b) => b.currentBalance - a.currentBalance)[0];
  }

  saveKey(key) {
    if (!this.data.keys) this.data.keys = [];
    this.data.keys.push(key);
    this.save();
    return key;
  }

  updateKey(id, updates) {
    const index = (this.data.keys || []).findIndex(k => k.id === id);
    if (index !== -1) {
      this.data.keys[index] = { ...this.data.keys[index], ...updates };
      this.save();
      return this.data.keys[index];
    }
    return null;
  }

  deleteKey(id) {
    this.data.keys = (this.data.keys || []).filter(k => k.id !== id);
    this.save();
    return true;
  }

  clearAllKeys() {
    this.data.keys = [];
    this.data.telemetryLogs = [];
    this.save();
    return true;
  }

  setKeyCooldown(id, durationSeconds = 60, reason = 'HTTP 429 Rate Limit') {
    const cooldownUntil = Date.now() + durationSeconds * 1000;
    this.updateKey(id, {
      cooldownUntil,
      status: 'cooling_down',
      lastCooldownReason: reason
    });
  }

  deductKeyBalance(id, amountUsd) {
    const key = this.getKeyById(id);
    if (key) {
      const newBalance = Math.max(0, Number((key.currentBalance - amountUsd).toFixed(4)));
      this.updateKey(id, { currentBalance: newBalance });
    }
  }

  getAllVirtualKeys() {
    const today = new Date().toISOString().split('T')[0];
    return (this.data.virtualKeys || []).map(vk => {
      if (vk.resetDayDate !== today) {
        vk.spentToday = 0;
        vk.resetDayDate = today;
      }
      return vk;
    });
  }

  getVirtualKey(keyString) {
    return this.getAllVirtualKeys().find(vk => vk.key === keyString && vk.isActive);
  }

  saveVirtualKey(vKey) {
    if (!this.data.virtualKeys) this.data.virtualKeys = [];
    this.data.virtualKeys.push(vKey);
    this.save();
    return vKey;
  }

  deleteVirtualKey(id) {
    this.data.virtualKeys = (this.data.virtualKeys || []).filter(vk => vk.id !== id);
    this.save();
    return true;
  }

  recordSpendOnVirtualKey(keyString, amountUsd) {
    const today = new Date().toISOString().split('T')[0];
    const index = (this.data.virtualKeys || []).findIndex(vk => vk.key === keyString);
    if (index !== -1) {
      const vk = this.data.virtualKeys[index];
      if (vk.resetDayDate !== today) {
        vk.spentToday = 0;
        vk.resetDayDate = today;
      }
      vk.spentToday = Number((vk.spentToday + amountUsd).toFixed(4));
      this.save();
    }
  }

  addTelemetryLog(log) {
    if (!this.data.telemetryLogs) this.data.telemetryLogs = [];
    this.data.telemetryLogs.unshift(log);
    if (this.data.telemetryLogs.length > 200) {
      this.data.telemetryLogs = this.data.telemetryLogs.slice(0, 200);
    }
    this.save();
  }

  getTelemetryLogs(limit = 50) {
    return (this.data.telemetryLogs || []).slice(0, limit);
  }

  getAggregatedMetrics() {
    const keys = this.getAllKeys();
    const logs = this.data.telemetryLogs || [];
    const oneMinuteAgo = Date.now() - 60 * 1000;
    const recentLogs = logs.filter(l => new Date(l.timestamp).getTime() > oneMinuteAgo);

    const activeRPM = recentLogs.length;
    const activeTPM = recentLogs.reduce((sum, l) => sum + (l.totalTokens || 0), 0);
    const totalBalance = keys.reduce((sum, k) => sum + (k.currentBalance || 0), 0);
    const totalSpentToday = logs.reduce((sum, l) => sum + (l.costUsd || 0), 0);
    const failoverCount = logs.filter(l => l.isFailover).length;

    return {
      activeRPM,
      activeTPM,
      totalBalance: Number(totalBalance.toFixed(2)),
      totalSpentToday: Number(totalSpentToday.toFixed(4)),
      failoverCount,
      healthyKeysCount: keys.filter(k => k.status === 'healthy').length,
      coolingDownCount: keys.filter(k => k.status === 'cooling_down').length,
      totalKeysCount: keys.length
    };
  }
}

export const db = new Database();
