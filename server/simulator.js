import { db } from './db.js';
import { calculateCost } from './pricing.js';

const DEMO_RESPONSES = [
  "Hello! I am an AI assistant routed securely through Relax Keys. Your real API credentials were never exposed, and token telemetry was recorded.",
  "Relax Keys successfully intercepted this request, calculated token consumption, and verified your rate limit remaining buffers.",
  "Here is your generated response. Relax Keys ensured zero 429 outages and kept your daily budget protected under your virtual key cap."
];

/**
 * Simulates an API call through the Relax Keys engine.
 * Useful for demoing telemetry, balance countdowns, and 429 auto-failover.
 */
export function runSimulation({ type = 'normal', provider = 'openai', model = 'gpt-4o', promptTokens = 450, completionTokens = 220 }) {
  const startTime = Date.now();
  const keys = db.getAllKeys().filter(k => k.provider === provider);
  const vKeys = db.getAllVirtualKeys();
  const primaryVKey = vKeys[0];

  if (type === 'failover_demo') {
    // 1. Deliberately hit a 429 on Primary Key
    const primaryKey = keys.find(k => k.id.includes('prod') || k.id.includes('primary')) || keys[0];
    const backupKey = keys.find(k => k.id.includes('backup')) || keys[1] || keys[0];

    // Put primary key in cooldown
    db.setKeyCooldown(primaryKey.id, 45, 'HTTP 429 Rate Limit Hit (Simulated Burst)');

    // Log the 429 event
    db.addTelemetryLog({
      id: `sim_429_${Date.now()}`,
      timestamp: new Date().toISOString(),
      provider,
      model,
      virtualKeyId: primaryVKey?.id,
      virtualKeyName: primaryVKey?.name || 'Production Virtual Key',
      realKeyId: primaryKey.id,
      realKeyLabel: primaryKey.label,
      statusCode: 429,
      latencyMs: 140,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      isFailover: false,
      rateLimitState: { rpmRemaining: 0, tpmRemaining: 0, resetTime: '45s' }
    });

    // 2. Seamlessly route to backup key
    const cost = calculateCost(model, promptTokens, completionTokens);
    db.deductKeyBalance(backupKey.id, cost.totalCost);
    if (primaryVKey) db.recordSpendOnVirtualKey(primaryVKey.key, cost.totalCost);

    db.addTelemetryLog({
      id: `sim_success_${Date.now()}`,
      timestamp: new Date().toISOString(),
      provider,
      model,
      virtualKeyId: primaryVKey?.id,
      virtualKeyName: primaryVKey?.name || 'Production Virtual Key',
      realKeyId: backupKey.id,
      realKeyLabel: backupKey.label,
      statusCode: 200,
      latencyMs: 380,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: cost.totalCost,
      isFailover: true,
      rateLimitState: { rpmRemaining: 499, tpmRemaining: 29200, resetTime: null }
    });

    return {
      status: 'success',
      failoverTriggered: true,
      throttledKey: primaryKey.label,
      backupKeyUsed: backupKey.label,
      message: `HTTP 429 simulated on '${primaryKey.label}'. Relax Keys instantly switched to '${backupKey.label}' with zero downtime.`,
      costUsd: cost.totalCost,
      tokensUsed: promptTokens + completionTokens
    };
  }

  // Normal request simulation
  const targetKey = db.getActiveKeyForProvider(provider);
  const cost = calculateCost(model, promptTokens, completionTokens);
  
  // Update state
  db.deductKeyBalance(targetKey.id, cost.totalCost);
  if (primaryVKey) db.recordSpendOnVirtualKey(primaryVKey.key, cost.totalCost);

  // Decrement RPM & TPM buffers slightly for live visual animation
  const currentRpm = targetKey.rateLimitState?.rpmRemaining || 500;
  const currentTpm = targetKey.rateLimitState?.tpmRemaining || 30000;
  db.updateKey(targetKey.id, {
    rateLimitState: {
      rpmRemaining: Math.max(10, currentRpm - 1),
      tpmRemaining: Math.max(500, currentTpm - (promptTokens + completionTokens)),
      resetTime: null
    }
  });

  const logEntry = {
    id: `sim_log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    provider,
    model,
    virtualKeyId: primaryVKey?.id,
    virtualKeyName: primaryVKey?.name || 'Production Virtual Key',
    realKeyId: targetKey.id,
    realKeyLabel: targetKey.label,
    statusCode: 200,
    latencyMs: Math.floor(Math.random() * 300) + 180,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costUsd: cost.totalCost,
    isFailover: false,
    rateLimitState: {
      rpmRemaining: Math.max(10, currentRpm - 1),
      tpmRemaining: Math.max(500, currentTpm - (promptTokens + completionTokens)),
      resetTime: null
    }
  };

  db.addTelemetryLog(logEntry);

  return {
    status: 'success',
    failoverTriggered: false,
    keyUsed: targetKey.label,
    costUsd: cost.totalCost,
    tokensUsed: promptTokens + completionTokens,
    reply: DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)]
  };
}
