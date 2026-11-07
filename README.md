# 🔑 Relax Keys

> **Zero 429s. Zero surprise bills. AI KeyOps on autopilot.**

Relax Keys is an open-source, developer-first gateway and encrypted vault for AI and REST API keys. It transparently sits between your applications and API providers, eliminating silent `HTTP 429 Too Many Requests` outages with instant failover, calculating real-time token spend, tracking remaining credit balances, and shielding real credentials with safe virtual keys.

---

## 🌟 Core Features

- **🛡️ The Virtual Key Shield (`rk_live_...`)**: Never put raw OpenAI or Anthropic keys in client applications. Generate masked virtual keys with daily budget caps. If a virtual key is leaked, revoke it in 1-click without changing your provider account.
- **⚡ Zero-Outage Auto-Failover**: When a primary API key hits a rate limit (`HTTP 429`), Relax Keys automatically activates a cooldown timer and seamlessly retries the request with a backup key in your pool.
- **📊 Real-Time Token Telemetry**: Sniffs `x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens`, and `retry-after` headers directly from provider responses without saving prompt or response bodies.
- **💰 Live Spend Accounting & Runway Estimator**: Micro-cost precision calculations for GPT-4o, Claude 3.5 Sonnet, Groq, DeepSeek, and Gemini. Computes average daily burn rate and predicts how many days of credit runway remain.
- **🔐 AES-256-GCM Encrypted Vault**: Stores real credentials with industry-standard encryption at rest.
- **🌐 Universal Mode**: Works out of the box with OpenAI endpoints as well as any REST API via `/proxy/:provider/*`.

---

## 🚀 Quick Start

### 1. Install & Run
```bash
cd relaxkeys
npm install
npm start
```
Open **[http://localhost:4000](http://localhost:4000)** in your browser to access the Mission Control Dashboard.

### 2. Drop-in Integration (OpenAI SDK)

Change just **one line** in your application: point `baseURL` to `http://localhost:4000/v1`.

#### Node.js / TypeScript
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:4000/v1',
  apiKey: 'rk_live_your_virtual_key' // Safe Relax Keys virtual token
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello via Relax Keys!' }]
});
console.log(response.choices[0].message.content);
```

#### Python
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="rk_live_your_virtual_key"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello via Relax Keys!"}]
)
print(response.choices[0].message.content)
```

#### cURL
```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rk_live_your_virtual_key" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello via Relax Keys!"}]
  }'
```

---

## 🧪 Interactive Sandbox

Use the **Live Sandbox** buttons on the dashboard to test features without spending real credits:
1. **Simulate Call**: Sends a mock prompt, increments the RPM/TPM meters, calculates token costs, and logs latency.
2. **Simulate 429 Failover**: Deliberately throttles your primary key, puts it into an amber cooldown, and watches Relax Keys automatically route to your backup tier with zero downtime!
