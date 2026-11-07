/**
 * Model pricing per 1 Million tokens (in USD).
 * Updated with current rates across major AI providers.
 */
export const MODEL_PRICING = {
  // OpenAI
  'gpt-4o': { prompt: 2.50, completion: 10.00, provider: 'openai' },
  'gpt-4o-2024-08-06': { prompt: 2.50, completion: 10.00, provider: 'openai' },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.60, provider: 'openai' },
  'gpt-4-turbo': { prompt: 10.00, completion: 30.00, provider: 'openai' },
  'gpt-3.5-turbo': { prompt: 0.50, completion: 1.50, provider: 'openai' },
  'o1': { prompt: 15.00, completion: 60.00, provider: 'openai' },
  'o1-mini': { prompt: 3.00, completion: 12.00, provider: 'openai' },
  'o3-mini': { prompt: 1.10, completion: 4.40, provider: 'openai' },

  // Anthropic Claude
  'claude-3-5-sonnet-20241022': { prompt: 3.00, completion: 15.00, provider: 'anthropic' },
  'claude-3-5-sonnet': { prompt: 3.00, completion: 15.00, provider: 'anthropic' },
  'claude-3-5-haiku': { prompt: 0.80, completion: 4.00, provider: 'anthropic' },
  'claude-3-opus': { prompt: 15.00, completion: 75.00, provider: 'anthropic' },
  'claude-3-haiku': { prompt: 0.25, completion: 1.25, provider: 'anthropic' },

  // DeepSeek
  'deepseek-chat': { prompt: 0.14, completion: 0.28, provider: 'deepseek' },
  'deepseek-reasoner': { prompt: 0.55, completion: 2.19, provider: 'deepseek' },

  // Groq / Open Models
  'llama-3.3-70b-versatile': { prompt: 0.59, completion: 0.79, provider: 'groq' },
  'llama-3.1-8b-instant': { prompt: 0.05, completion: 0.08, provider: 'groq' },
  'mixtral-8x7b-32768': { prompt: 0.24, completion: 0.24, provider: 'groq' },

  // Google Gemini
  'gemini-1.5-pro': { prompt: 1.25, completion: 5.00, provider: 'gemini' },
  'gemini-1.5-flash': { prompt: 0.075, completion: 0.30, provider: 'gemini' },
  'gemini-2.0-flash': { prompt: 0.10, completion: 0.40, provider: 'gemini' }
};

const DEFAULT_RATES = { prompt: 1.00, completion: 2.00, provider: 'generic' };

/**
 * Calculates the exact dollar cost of a prompt and completion.
 */
export function calculateCost(modelName, promptTokens = 0, completionTokens = 0) {
  const modelKey = (modelName || '').toLowerCase().trim();
  const pricing = MODEL_PRICING[modelKey] || DEFAULT_RATES;

  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * pricing.completion;
  const totalCost = promptCost + completionCost;

  return {
    promptCost: Number(promptCost.toFixed(6)),
    completionCost: Number(completionCost.toFixed(6)),
    totalCost: Number(totalCost.toFixed(6)),
    currency: 'USD'
  };
}
