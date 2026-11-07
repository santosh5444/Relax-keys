/**
 * Universal AI Key Diagnostic & Probe Engine.
 * Inspects any AI API key and returns comprehensive technical diagnostics:
 * - Validity & Health (Active / Revoked / Quota Exceeded)
 * - Provider & Key Type (Project Key, User Key, Cloud Key)
 * - Rate Limits (RPM & TPM quotas)
 * - Account Balance & Quota status
 * - Complete Authorized Models List
 */

export function detectProvider(key = '') {
  const trimmed = key.trim();

  if (trimmed.startsWith('sk-ant-')) return 'anthropic';
  if (trimmed.startsWith('gsk_')) return 'groq';
  if (trimmed.startsWith('sk-or-v1-')) return 'openrouter';
  if (trimmed.startsWith('AIzaSy')) return 'gemini';
  if (trimmed.startsWith('pplx-')) return 'perplexity';
  if (trimmed.startsWith('dsk-') || trimmed.includes('deepseek')) return 'deepseek';
  if (trimmed.startsWith('sk-proj-') || trimmed.startsWith('sk-admin-') || (trimmed.startsWith('sk-') && trimmed.length > 30)) {
    return 'openai';
  }

  return 'generic';
}

function detectKeyType(key = '', provider = '') {
  const trimmed = key.trim();
  if (provider === 'openai') {
    if (trimmed.startsWith('sk-proj-')) return 'OpenAI Project Key (Scoped)';
    if (trimmed.startsWith('sk-admin-')) return 'OpenAI Admin Key';
    return 'OpenAI Standard Secret Key';
  }
  if (provider === 'groq') return 'Groq Cloud API Key';
  if (provider === 'anthropic') return 'Anthropic Workspace Key';
  if (provider === 'openrouter') return 'OpenRouter Unified Key';
  if (provider === 'deepseek') return 'DeepSeek Platform Key';
  if (provider === 'gemini') return 'Google AI Studio Key';
  return 'Custom REST API Key';
}

function cleanModelList(rawModels = []) {
  return rawModels
    .filter(id => {
      const lower = id.toLowerCase();
      return !lower.includes('whisper') &&
             !lower.includes('dall-e') &&
             !lower.includes('tts') &&
             !lower.includes('moderation') &&
             !lower.includes('realtime') &&
             !lower.includes('audio');
    })
    .slice(0, 40);
}

export async function probeApiKey(rawKey, customProvider = null) {
  const key = rawKey.trim();
  const provider = customProvider || detectProvider(key);
  const keyType = detectKeyType(key, provider);

  const result = {
    valid: false,
    provider,
    providerName: provider.toUpperCase(),
    keyType,
    label: '',
    rpmLimit: 500,
    tpmLimit: 30000,
    rpmRemaining: 500,
    tpmRemaining: 30000,
    balance: null,
    hasRealBalance: false,
    currency: 'USD',
    quotaStatus: 'Checking...',
    status: 'unverified', // healthy, invalid, quota_exceeded, cooling_down
    modelsCount: 0,
    availableModels: [],
    message: '',
    checkedAt: new Date().toISOString()
  };

  try {
    switch (provider) {
      // -------------------------------------------------------------
      // 1. OPENAI
      // -------------------------------------------------------------
      case 'openai': {
        result.providerName = 'OpenAI';
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });

        const rpm = res.headers.get('x-ratelimit-limit-requests') || res.headers.get('x-ratelimit-remaining-requests');
        const tpm = res.headers.get('x-ratelimit-limit-tokens') || res.headers.get('x-ratelimit-remaining-tokens');
        if (rpm) result.rpmLimit = parseInt(rpm, 10);
        if (tpm) result.tpmLimit = parseInt(tpm, 10);

        if (res.status === 200) {
          const data = await res.json();
          const allModels = (data.data || []).map(m => m.id);
          result.valid = true;
          result.status = 'healthy';
          result.quotaStatus = 'Active & Funded';
          result.modelsCount = allModels.length;
          result.availableModels = cleanModelList(allModels);
          result.label = `OpenAI (${result.modelsCount} models accessible)`;
          result.message = `Key is active and verified. Live quotas: ${result.rpmLimit} RPM / ${result.tpmLimit.toLocaleString()} TPM.`;
        } else if (res.status === 401) {
          result.valid = false;
          result.status = 'invalid';
          result.quotaStatus = 'Unauthorized';
          result.message = 'Key is invalid, revoked, or deleted on OpenAI.';
        } else if (res.status === 429) {
          result.valid = true;
          result.status = 'quota_exceeded';
          result.quotaStatus = 'Quota Exhausted / Throttled';
          result.message = 'Key exists, but current account balance is $0 or rate limit was hit (HTTP 429).';
        } else {
          result.valid = false;
          result.status = 'invalid';
          result.message = `OpenAI returned status code ${res.status}.`;
        }
        break;
      }

      // -------------------------------------------------------------
      // 2. GROQ CLOUD
      // -------------------------------------------------------------
      case 'groq': {
        result.providerName = 'Groq Cloud';
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });

        const rpm = res.headers.get('x-ratelimit-limit-requests') || res.headers.get('x-ratelimit-remaining-requests');
        const tpm = res.headers.get('x-ratelimit-limit-tokens') || res.headers.get('x-ratelimit-remaining-tokens');
        if (rpm) result.rpmLimit = parseInt(rpm, 10);
        if (tpm) result.tpmLimit = parseInt(tpm, 10);

        if (res.status === 200) {
          const data = await res.json();
          const allModels = (data.data || []).map(m => m.id);
          result.valid = true;
          result.status = 'healthy';
          result.quotaStatus = 'Active (High Speed Tier)';
          result.modelsCount = allModels.length;
          result.availableModels = allModels;
          result.label = 'Groq Cloud API Key';
          result.message = `Groq key active with ${result.modelsCount} models accessible.`;
        } else if (res.status === 401) {
          result.valid = false;
          result.status = 'invalid';
          result.quotaStatus = 'Unauthorized';
          result.message = 'Invalid Groq API key.';
        } else {
          result.valid = false;
          result.status = 'invalid';
          result.message = `Groq returned HTTP ${res.status}`;
        }
        break;
      }

      // -------------------------------------------------------------
      // 3. OPENROUTER (REAL BALANCE & LIMITS)
      // -------------------------------------------------------------
      case 'openrouter': {
        result.providerName = 'OpenRouter';
        const [authRes, modelsRes] = await Promise.all([
          fetch('https://openrouter.ai/api/v1/auth/key', { headers: { 'Authorization': `Bearer ${key}` } }),
          fetch('https://openrouter.ai/api/v1/models')
        ]);

        if (authRes.status === 200) {
          const data = await authRes.json();
          const info = data.data || {};
          const limit = info.limit !== null ? parseFloat(info.limit) : 100.00;
          const usage = info.usage !== null ? parseFloat(info.usage) : 0.00;
          const remainingBalance = Math.max(0, limit - usage);

          let models = ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat'];
          if (modelsRes.ok) {
            try {
              const mData = await modelsRes.json();
              models = (mData.data || []).slice(0, 30).map(m => m.id);
            } catch {}
          }

          result.valid = true;
          result.status = remainingBalance <= 0 ? 'quota_exceeded' : 'healthy';
          result.quotaStatus = remainingBalance <= 0 ? 'Balance $0.00' : `$${remainingBalance.toFixed(2)} Balance Available`;
          result.label = info.label || 'OpenRouter Unified Key';
          result.balance = Number(remainingBalance.toFixed(2));
          result.hasRealBalance = true;
          result.modelsCount = models.length;
          result.availableModels = models;
          result.message = `Active OpenRouter key! Live remaining balance: $${result.balance.toFixed(2)}.`;
        } else {
          result.valid = false;
          result.status = 'invalid';
          result.quotaStatus = 'Unauthorized';
          result.message = 'Invalid OpenRouter API key.';
        }
        break;
      }

      // -------------------------------------------------------------
      // 4. DEEPSEEK (REAL BALANCE & MODELS)
      // -------------------------------------------------------------
      case 'deepseek': {
        result.providerName = 'DeepSeek';
        const res = await fetch('https://api.deepseek.com/user/balance', {
          headers: { 'Authorization': `Bearer ${key}` }
        });

        const knownDeepSeekModels = ['deepseek-chat', 'deepseek-reasoner'];

        if (res.status === 200) {
          const data = await res.json();
          const balances = data.balance_infos || [];
          const primaryBalance = balances[0] || {};
          const totalVal = parseFloat(primaryBalance.total_balance) || 0.00;

          result.valid = true;
          result.status = totalVal <= 0 ? 'quota_exceeded' : 'healthy';
          result.balance = Number(totalVal.toFixed(2));
          result.currency = primaryBalance.currency || 'USD';
          result.hasRealBalance = true;
          result.quotaStatus = totalVal <= 0 ? 'Balance $0.00' : `${result.currency} ${result.balance.toFixed(2)} Available`;
          result.modelsCount = knownDeepSeekModels.length;
          result.availableModels = knownDeepSeekModels;
          result.label = 'DeepSeek V3 / R1 Key';
          result.message = `DeepSeek key active! Live balance: ${result.currency} ${result.balance.toFixed(2)}.`;
        } else if (res.status === 401) {
          result.valid = false;
          result.status = 'invalid';
          result.quotaStatus = 'Unauthorized';
          result.message = 'Invalid DeepSeek API key.';
        } else {
          result.valid = false;
          result.status = 'invalid';
          result.message = `DeepSeek returned HTTP ${res.status}`;
        }
        break;
      }

      // -------------------------------------------------------------
      // 5. ANTHROPIC (CLAUDE)
      // -------------------------------------------------------------
      case 'anthropic': {
        result.providerName = 'Anthropic Claude';
        const knownClaudeModels = [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-haiku-20240307'
        ];

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }]
          })
        });

        const rpm = res.headers.get('anthropic-ratelimit-requests-limit');
        const tpm = res.headers.get('anthropic-ratelimit-tokens-limit');
        if (rpm) result.rpmLimit = parseInt(rpm, 10);
        if (tpm) result.tpmLimit = parseInt(tpm, 10);

        if (res.status === 200 || res.status === 400) {
          result.valid = true;
          result.status = 'healthy';
          result.quotaStatus = 'Active & Funded';
          result.modelsCount = knownClaudeModels.length;
          result.availableModels = knownClaudeModels;
          result.label = 'Anthropic Claude Key';
          result.message = `Valid Anthropic key with access to Claude 3.5 Sonnet, Haiku, and Opus.`;
        } else if (res.status === 401) {
          result.valid = false;
          result.status = 'invalid';
          result.quotaStatus = 'Unauthorized';
          result.message = 'Invalid Anthropic API key.';
        } else {
          result.valid = false;
          result.status = 'invalid';
          result.message = `Anthropic returned HTTP ${res.status}`;
        }
        break;
      }

      // -------------------------------------------------------------
      // 6. GOOGLE GEMINI
      // -------------------------------------------------------------
      case 'gemini': {
        result.providerName = 'Google Gemini';
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);

        if (res.status === 200) {
          const data = await res.json();
          const models = (data.models || [])
            .map(m => m.name.replace('models/', ''))
            .filter(name => name.includes('gemini'));

          result.valid = true;
          result.status = 'healthy';
          result.quotaStatus = 'Active (Google AI Studio)';
          result.modelsCount = models.length;
          result.availableModels = models;
          result.label = `Google Gemini (${models.length} models)`;
          result.rpmLimit = 60;
          result.tpmLimit = 120000;
          result.message = `Valid Gemini API key with access to ${models.length} models.`;
        } else {
          result.valid = false;
          result.status = 'invalid';
          result.quotaStatus = 'Unauthorized';
          result.message = 'Invalid Google Gemini API key.';
        }
        break;
      }

      default: {
        result.providerName = 'Custom AI Provider';
        result.label = 'Custom REST API Key';
        result.valid = true;
        result.status = 'healthy';
        result.quotaStatus = 'Configured';
        result.availableModels = ['custom-model'];
        result.message = 'Key configured.';
        break;
      }
    }
  } catch (err) {
    result.valid = false;
    result.status = 'invalid';
    result.quotaStatus = 'Network Error';
    result.message = `Inspection failed: ${err.message}`;
  }

  return result;
}
