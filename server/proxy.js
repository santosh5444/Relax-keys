import { db } from './db.js';
import { decryptApiKey } from './crypto.js';
import { calculateCost } from './pricing.js';

const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  groq: 'https://api.groq.com/openai',
  deepseek: 'https://api.deepseek.com',
  gemini: 'https://generativelanguage.googleapis.com'
};

/**
 * Resolves the provider and target URL.
 * Automatically inspects the requested model name if calling /v1/chat/completions.
 */
function resolveProvider(req, providerParam) {
  if (providerParam && PROVIDER_BASE_URLS[providerParam.toLowerCase()]) {
    return providerParam.toLowerCase();
  }

  // Model heuristic if using standard OpenAI endpoint
  const body = req.body || {};
  const model = (body.model || '').toLowerCase();
  if (model.includes('claude')) return 'anthropic';
  if (model.includes('llama') || model.includes('mixtral')) return 'groq';
  if (model.includes('deepseek')) return 'deepseek';
  if (model.includes('gemini')) return 'gemini';

  return 'openai';
}

/**
 * Intercepts rate limit headers and updates in-memory key state.
 */
function extractRateLimits(headers) {
  const rpm = headers.get('x-ratelimit-remaining-requests') ||
              headers.get('anthropic-ratelimit-requests-remaining');
  const tpm = headers.get('x-ratelimit-remaining-tokens') ||
              headers.get('anthropic-ratelimit-tokens-remaining');
  const reset = headers.get('x-ratelimit-reset-requests') ||
                headers.get('retry-after') ||
                headers.get('anthropic-ratelimit-requests-reset');

  return {
    rpmRemaining: rpm ? parseInt(rpm, 10) : null,
    tpmRemaining: tpm ? parseInt(tpm, 10) : null,
    resetTime: reset || null
  };
}

/**
 * Core Proxy Handler with Auto-Failover & Rate Limit Sniffing.
 */
export async function handleProxyRequest(req, res, providerParam = null) {
  const startTime = Date.now();
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  // 1. Virtual Key Validation
  let virtualKey = null;
  if (token && token.startsWith('rk_live_')) {
    virtualKey = db.getVirtualKey(token);
    if (!virtualKey) {
      return res.status(401).json({
        error: { message: 'Invalid or inactive Relax Keys Virtual Key.', code: 'invalid_virtual_key' }
      });
    }

    if (virtualKey.spentToday >= virtualKey.dailySpendLimit) {
      return res.status(429).json({
        error: {
          message: `Relax Keys Shield: Daily budget limit ($${virtualKey.dailySpendLimit.toFixed(2)}) reached for key '${virtualKey.name}'. Requests paused to prevent surprise charges.`,
          code: 'daily_budget_exceeded'
        }
      });
    }
  }

  const provider = resolveProvider(req, providerParam);
  let isFailover = false;
  let targetPath = req.originalUrl.replace(/^\/proxy\/[^\/]+/, '');
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

  // 2. Fetch Active Key & Attempt Forwarding with Failover Loop
  let attempts = 0;
  const maxAttempts = 2; // Can retry with backup key once

  while (attempts < maxAttempts) {
    attempts++;
    let realKeyRecord;

    try {
      realKeyRecord = db.getActiveKeyForProvider(provider);
    } catch (err) {
      return res.status(503).json({
        error: { message: err.message, code: 'no_healthy_keys' }
      });
    }

    // Decrypt real key if encrypted, or use fallback
    let actualApiKey = realKeyRecord.maskedKey;
    if (realKeyRecord.encryptedKey && realKeyRecord.iv && realKeyRecord.tag) {
      try {
        actualApiKey = decryptApiKey(realKeyRecord.encryptedKey, realKeyRecord.iv, realKeyRecord.tag);
      } catch (decErr) {
        console.error('Decryption failed, falling back:', decErr.message);
      }
    }

    const baseUrl = PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.openai;
    const targetUrl = `${baseUrl}${targetPath}`;

    // Prepare headers
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['content-length'];
    forwardHeaders['authorization'] = `Bearer ${actualApiKey}`;
    if (provider === 'anthropic') {
      forwardHeaders['x-api-key'] = actualApiKey;
      forwardHeaders['anthropic-version'] = forwardHeaders['anthropic-version'] || '2023-06-01';
    }

    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
      });

      const latencyMs = Date.now() - startTime;
      const rateLimits = extractRateLimits(response.headers);

      // Update rate limits in database
      if (rateLimits.rpmRemaining !== null || rateLimits.tpmRemaining !== null) {
        db.updateKey(realKeyRecord.id, {
          rateLimitState: {
            rpmRemaining: rateLimits.rpmRemaining ?? realKeyRecord.rateLimitState?.rpmRemaining,
            tpmRemaining: rateLimits.tpmRemaining ?? realKeyRecord.rateLimitState?.tpmRemaining,
            resetTime: rateLimits.resetTime
          }
        });
      }

      // Check for Rate Limit (HTTP 429)
      if (response.status === 429) {
        const retryAfterSec = parseInt(response.headers.get('retry-after') || '60', 10);
        console.warn(`[RelaxKeys] HTTP 429 Throttling detected on key ${realKeyRecord.label}. Activating ${retryAfterSec}s cooldown.`);
        
        db.setKeyCooldown(realKeyRecord.id, retryAfterSec, 'HTTP 429 Rate Limit Hit');

        // Check if a backup key exists for this provider
        try {
          const backupKey = db.getActiveKeyForProvider(provider);
          if (backupKey && backupKey.id !== realKeyRecord.id) {
            console.log(`[RelaxKeys] Seamlessly failing over to backup key: ${backupKey.label}`);
            isFailover = true;
            continue; // Retry loop with the backup key!
          }
        } catch {
          // No backup available, will fall through and return the 429
        }
      }

      // Parse body & usage for cost calculation
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        const data = await response.json();

        // Calculate Cost & Token Usage
        const model = req.body?.model || data.model || 'gpt-4o';
        const usage = data.usage || {};
        const promptTokens = usage.prompt_tokens || 0;
        const completionTokens = usage.completion_tokens || 0;
        const totalTokens = usage.total_tokens || (promptTokens + completionTokens);

        const cost = calculateCost(model, promptTokens, completionTokens);

        // Deduct from real key balance & virtual key daily spend
        db.deductKeyBalance(realKeyRecord.id, cost.totalCost);
        if (virtualKey) {
          db.recordSpendOnVirtualKey(virtualKey.key, cost.totalCost);
        }

        // Record telemetry log
        db.addTelemetryLog({
          id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          timestamp: new Date().toISOString(),
          provider,
          model,
          virtualKeyId: virtualKey ? virtualKey.id : null,
          virtualKeyName: virtualKey ? virtualKey.name : 'Direct API Call',
          realKeyId: realKeyRecord.id,
          realKeyLabel: realKeyRecord.label,
          statusCode: response.status,
          latencyMs,
          promptTokens,
          completionTokens,
          totalTokens,
          costUsd: cost.totalCost,
          isFailover,
          rateLimitState: rateLimits
        });

        // Forward response headers & JSON body
        res.status(response.status);
        response.headers.forEach((val, key) => {
          if (!['content-encoding', 'content-length'].includes(key.toLowerCase())) {
            res.setHeader(key, val);
          }
        });
        res.setHeader('x-relaxkeys-cost-usd', cost.totalCost.toString());
        res.setHeader('x-relaxkeys-failover', isFailover ? 'true' : 'false');
        return res.json(data);
      } else {
        // Stream pass-through
        res.status(response.status);
        response.headers.forEach((val, key) => res.setHeader(key, val));
        const stream = response.body;
        if (stream) {
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        }
        return res.end();
      }
    } catch (netErr) {
      console.error(`Proxy forwarding error on key ${realKeyRecord.id}:`, netErr.message);
      if (attempts < maxAttempts) {
        isFailover = true;
        continue;
      }
      return res.status(502).json({
        error: { message: `Relax Keys Proxy Gateway Error: ${netErr.message}`, code: 'bad_gateway' }
      });
    }
  }
}
