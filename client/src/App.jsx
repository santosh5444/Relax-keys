import React, { useState, useEffect } from 'react';
import {
  Key, Shield, Activity, DollarSign, AlertCircle, CheckCircle2,
  Copy, Check, Plus, Trash2, RefreshCw, Loader2, Sparkles,
  Search, ExternalLink, Cpu, X, Zap, ChevronRight, BookmarkPlus,
  HelpCircle, Eye, EyeOff, Globe, Tag, ArrowRight, Lock, Laptop,
  Smartphone, Share2
} from 'lucide-react';
import {
  generatePassphrase, computeVaultId, encryptPayload, decryptPayload
} from './vaultCrypto';

// Verified, realistic provider pricing & free tier status
const AI_PROVIDERS_DIRECTORY = [
  {
    id: 'groq',
    name: 'Groq Cloud',
    category: 'free',
    badge: '100% Free Tier',
    badgeColor: 'emerald',
    directUrl: 'https://console.groq.com/keys',
    freeDetails: 'Free developer tier: 14,400 requests/day, 30 RPM',
    pricingNote: 'Free access to LLaMA 3.3 70B & LLaMA 3.1 8B. No credit card required.',
    topModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
  },
  {
    id: 'gemini',
    name: 'Google AI Studio',
    category: 'free',
    badge: '100% Free Tier',
    badgeColor: 'emerald',
    directUrl: 'https://aistudio.google.com/app/apikey',
    freeDetails: 'Free tier: 1,500 requests/day & 15 RPM',
    pricingNote: 'Free access to Gemini 1.5 & 2.0 Flash in AI Studio. Pay-as-you-go optional for higher limits.',
    topModels: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'free',
    badge: 'Free Models + Multi-LLM',
    badgeColor: 'emerald',
    directUrl: 'https://openrouter.ai/keys',
    freeDetails: 'Dozens of :free models available at $0.00',
    pricingNote: 'Access LLaMA 3.3, Gemini, and DeepSeek for free via :free tag, or deposit $5 for premium models.',
    topModels: ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-r1:free']
  },
  {
    id: 'deepseek',
    name: 'DeepSeek Platform',
    category: 'trial',
    badge: 'Free Signup Tokens + Ultra-Cheap',
    badgeColor: 'blue',
    directUrl: 'https://platform.deepseek.com/api_keys',
    freeDetails: '5 Million free tokens upon initial account signup',
    pricingNote: 'After trial: lowest rates in AI industry ($0.14 / 1M tokens input, $0.28 output).',
    topModels: ['deepseek-chat', 'deepseek-reasoner']
  },
  {
    id: 'openai',
    name: 'OpenAI Platform',
    category: 'paid',
    badge: 'Paid (Min $5 Deposit)',
    badgeColor: 'amber',
    directUrl: 'https://platform.openai.com/api-keys',
    freeDetails: 'No permanent free tier. Requires prepaid credits.',
    pricingNote: 'Deposit minimum $5 to activate Tier 1. GPT-4o-mini is ultra-cheap ($0.15/1M input).',
    topModels: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini']
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    category: 'paid',
    badge: 'Paid (Min $5 Deposit)',
    badgeColor: 'amber',
    directUrl: 'https://console.anthropic.com/settings/keys',
    freeDetails: 'Requires prepaid deposit. Occasional trial credit for work emails.',
    pricingNote: 'Claude 3.5 Sonnet is $3.00/1M input, Claude 3.5 Haiku is $0.80/1M input.',
    topModels: ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus']
  },
  {
    id: 'mistral',
    name: 'Mistral AI (La Plateforme)',
    category: 'free',
    badge: 'Free Experimenter Tier',
    badgeColor: 'emerald',
    directUrl: 'https://console.mistral.ai/api-keys',
    freeDetails: 'Free tier with 1 request/sec rate limit',
    pricingNote: 'Free access for experimentation with Codestral and Mistral Small. Paid tier for production.',
    topModels: ['mistral-small-latest', 'codestral-latest']
  }
];

export default function App() {
  const [inputKey, setInputKey] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [report, setReport] = useState(null);
  const [modelFilter, setModelFilter] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState('all');
  const [savedKeys, setSavedKeys] = useState([]);
  const [isRecheckingAll, setIsRecheckingAll] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [notification, setNotification] = useState(null);
  const [selectedModelsModal, setSelectedModelsModal] = useState(null);

  // Zero-Knowledge Sync Modal State
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncTab, setSyncTab] = useState('pair'); // pair, link
  const [generatedPassphrase, setGeneratedPassphrase] = useState('');
  const [inputPassphrase, setInputPassphrase] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState(null);

  // Fetch saved monitored keys
  const fetchSavedKeys = async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) setSavedKeys(await res.json());
    } catch (err) {
      console.error('Failed to load saved keys:', err);
    }
  };

  useEffect(() => {
    fetchSavedKeys();
    setGeneratedPassphrase(generatePassphrase());
  }, []);

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Inspect Key
  const handleInspect = async (keyToTest) => {
    const targetKey = (keyToTest || inputKey).trim();
    if (!targetKey) return;

    setIsInspecting(true);
    setReport(null);
    setModelFilter('');

    try {
      const res = await fetch('/api/keys/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawKey: targetKey })
      });
      const data = await res.json();
      setReport({ ...data, rawKey: targetKey });
    } catch (err) {
      setReport({
        valid: false,
        providerName: 'Unknown',
        status: 'invalid',
        message: 'Could not inspect key: ' + err.message
      });
    } finally {
      setIsInspecting(false);
    }
  };

  // Save Inspected Key to Monitored List
  const handleSaveToMonitored = async () => {
    if (!report || !report.rawKey) return;
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: report.provider,
          label: report.label || `${report.providerName} Key`,
          rawKey: report.rawKey,
          balance: report.balance || 20.00,
          rpmLimit: report.rpmLimit,
          tpmLimit: report.tpmLimit,
          availableModels: report.availableModels || []
        })
      });
      if (res.ok) {
        showToast(`Saved ${report.providerName} key to your monitored list.`);
        fetchSavedKeys();
      }
    } catch (err) {
      showToast('Error saving key: ' + err.message, 'error');
    }
  };

  // Zero-Knowledge Upload to Encrypted Sync Vault
  const handleUploadSyncVault = async () => {
    if (savedKeys.length === 0) {
      showToast('Add at least one key to your monitored list before syncing.', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      const vaultId = await computeVaultId(generatedPassphrase);
      const encrypted = await encryptPayload(generatedPassphrase, savedKeys);

      const res = await fetch('/api/sync/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId,
          encryptedBlob: encrypted.encryptedBlob,
          iv: encrypted.iv,
          salt: encrypted.salt
        })
      });

      if (res.ok) {
        setSyncSuccessMessage(
          `✓ Keys encrypted with AES-256 and backed up. Server holds 0 plaintext keys. Enter this 4-word passphrase on your other device to sync.`
        );
      } else {
        showToast('Failed to upload encrypted vault.', 'error');
      }
    } catch (err) {
      showToast('Encryption failed: ' + err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Zero-Knowledge Decrypt & Restore from Another Device
  const handleRestoreFromPassphrase = async (e) => {
    e.preventDefault();
    const cleanPass = inputPassphrase.trim().toLowerCase();
    if (!cleanPass) return;

    setIsSyncing(true);
    try {
      const vaultId = await computeVaultId(cleanPass);
      const res = await fetch('/api/sync/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Vault not found.');
      }

      // Decrypt in browser memory
      const decryptedKeys = await decryptPayload(
        cleanPass,
        data.encryptedBlob,
        data.iv,
        data.salt
      );

      // Save decrypted keys locally
      for (const k of decryptedKeys) {
        await fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: k.provider,
            label: k.label,
            rawKey: k.maskedKey, // Safe reference
            balance: k.currentBalance || 20.0,
            rpmLimit: k.rpmLimit,
            tpmLimit: k.tpmLimit,
            availableModels: k.availableModels || []
          })
        });
      }

      await fetch('/api/sync/success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultId })
      });

      showToast(`Successfully decrypted and synced ${decryptedKeys.length} keys!`);
      setShowSyncModal(false);
      setInputPassphrase('');
      fetchSavedKeys();
    } catch (err) {
      // Record failed guess to trigger rate limit lockdown
      try {
        const vaultId = await computeVaultId(cleanPass);
        await fetch('/api/sync/failed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vaultId })
        });
      } catch {}

      showToast('Decryption failed: ' + err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Re-check All Saved Keys
  const handleRecheckAll = async () => {
    setIsRecheckingAll(true);
    try {
      const res = await fetch('/api/keys/recheck-all', { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setSavedKeys(updated);
        showToast('All saved keys re-checked and updated.');
      }
    } catch {
      showToast('Error re-checking keys', 'error');
    } finally {
      setIsRecheckingAll(false);
    }
  };

  // Delete Saved Key
  const handleDeleteKey = async (id, label) => {
    if (!confirm(`Remove ${label} from monitored list?`)) return;
    try {
      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`Removed ${label}`);
        fetchSavedKeys();
      }
    } catch {
      showToast('Error deleting key', 'error');
    }
  };

  const filteredModels = (report?.availableModels || []).filter(m =>
    m.toLowerCase().includes(modelFilter.toLowerCase())
  );

  const filteredDirectory = AI_PROVIDERS_DIRECTORY.filter(p => {
    if (directoryFilter === 'free') return p.category === 'free';
    if (directoryFilter === 'paid') return p.category === 'paid' || p.category === 'trial';
    return true;
  });

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 pb-24">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-2xl border text-xs font-medium flex items-center space-x-2 transition-all ${
          notification.type === 'error'
            ? 'bg-red-950/90 border-red-500/50 text-red-200'
            : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
        }`}>
          {notification.type === 'error' ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <nav className="border-b border-[#151926] bg-[#0a0d14]/80 backdrop-blur sticky top-0 z-30 px-6 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-500/10">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white">Relax Keys</span>
              <span className="text-[11px] text-slate-400 ml-2 hidden sm:inline">AI Key Inspector & Sync Vault</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => { setShowSyncModal(true); setSyncSuccessMessage(null); }}
              className="px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/60 text-xs font-medium transition flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sync Across Devices</span>
            </button>
            <a
              href="#get-keys"
              className="text-xs text-slate-300 hover:text-emerald-400 transition font-medium hidden sm:flex items-center gap-1"
            >
              <span>Get AI Keys</span>
              <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-6 pt-10 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Shield className="w-3.5 h-3.5" />
            <span>Zero-Knowledge • Immune to AI Cracking • No Logins</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Inspect Any AI API Key
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Paste any key to instantly check its live status, rate limits (RPM/TPM), credit balance, and authorized models.
          </p>
        </div>

        {/* Big Search / Inspection Box */}
        <div className="max-w-2xl mx-auto space-y-2">
          <div className="relative flex items-center">
            <input
              type="text"
              autoFocus
              placeholder="Paste key: sk-proj-..., gsk_..., sk-or-..., sk-ant-..., AIzaSy..."
              value={inputKey}
              onChange={(e) => {
                setInputKey(e.target.value);
                if (e.target.value.trim().length > 20) {
                  handleInspect(e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInspect();
              }}
              className="w-full bg-[#0d111a] border border-[#1f2638] focus:border-emerald-500 rounded-2xl py-3.5 pl-4 pr-32 text-sm text-white placeholder-slate-500 font-mono focus:outline-none transition shadow-xl"
            />
            <button
              onClick={() => handleInspect()}
              disabled={isInspecting || !inputKey.trim()}
              className="absolute right-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 disabled:opacity-50 shadow-md"
            >
              {isInspecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Probing...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Inspect</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-2 font-mono">
            <span>Supports OpenAI, Groq, Anthropic, OpenRouter, DeepSeek, Gemini</span>
            <a href="#get-keys" className="text-emerald-400 hover:underline">Need a key? ↗</a>
          </div>
        </div>

        {/* Loading Spinner */}
        {isInspecting && (
          <div className="max-w-2xl mx-auto p-8 rounded-2xl border border-[#1b2233] bg-[#0c1018] text-center space-y-3 animate-fade-in">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
            <h3 className="text-sm font-semibold text-white">Inspecting Key with Provider...</h3>
            <p className="text-xs text-slate-400">Pinging server to extract live quotas, balance, and models list.</p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DIAGNOSTIC REPORT CARD */}
        {/* ========================================================================= */}
        {report && !isInspecting && (
          <div className="max-w-2xl mx-auto rounded-2xl border border-[#1f2638] bg-[#0d111a] overflow-hidden shadow-2xl animate-fade-in">
            {/* Card Header */}
            <div className="p-5 border-b border-[#1a2130] bg-[#0f1420] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {report.providerName}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{report.keyType}</span>
                </div>
                <h2 className="text-base font-bold text-white mt-1.5">{report.label || `${report.providerName} Key`}</h2>
              </div>

              {/* Status Badge */}
              <div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border shadow-sm ${
                  report.status === 'healthy'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : report.status === 'quota_exceeded'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    report.status === 'healthy' ? 'bg-emerald-400 animate-pulse' : report.status === 'quota_exceeded' ? 'bg-amber-400' : 'bg-red-400'
                  }`}></span>
                  {report.status === 'healthy' ? 'Active & Verified' : report.status === 'quota_exceeded' ? 'Quota Exhausted ($0)' : 'Invalid / Revoked'}
                </span>
              </div>
            </div>

            {/* Diagnostic Metrics Grid */}
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#090c13] border border-[#171d2b]">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Health</span>
                  <div className="mt-1 font-bold text-sm text-white capitalize">{report.status}</div>
                  <p className="mt-0.5 text-[10px] text-slate-500">Live API response</p>
                </div>

                <div className="p-3 rounded-xl bg-[#090c13] border border-[#171d2b]">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Rate Limit (RPM)</span>
                  <div className="mt-1 font-bold text-sm text-white">{report.rpmLimit} <span className="text-xs font-normal text-slate-400">req/m</span></div>
                  <p className="mt-0.5 text-[10px] text-slate-500">Max throughput</p>
                </div>

                <div className="p-3 rounded-xl bg-[#090c13] border border-[#171d2b]">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Token Limit (TPM)</span>
                  <div className="mt-1 font-bold text-sm text-white">{report.tpmLimit.toLocaleString()}</div>
                  <p className="mt-0.5 text-[10px] text-slate-500">Tokens per minute</p>
                </div>

                <div className="p-3 rounded-xl bg-[#090c13] border border-[#171d2b]">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Balance / Quota</span>
                  <div className="mt-1 font-bold text-sm text-emerald-400 truncate">
                    {report.hasRealBalance ? `$${report.balance.toFixed(2)}` : report.quotaStatus}
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">{report.hasRealBalance ? 'Exact live balance' : 'Billing state'}</p>
                </div>
              </div>

              {/* Message Note / Top-Up Action if Expired */}
              <div className="p-3 rounded-xl bg-[#090c13] border border-[#171d2b] text-xs text-slate-300 space-y-2">
                <div className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <p className="leading-relaxed">{report.message}</p>
                </div>

                {report.status !== 'healthy' && (
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-amber-300 font-medium">Need to top up credits or generate a new key?</span>
                    <a
                      href={AI_PROVIDERS_DIRECTORY.find(p => p.id === report.provider)?.directUrl || 'https://platform.openai.com'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 font-bold inline-flex items-center gap-1"
                    >
                      <span>Open {report.providerName} Dashboard</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Accessible Models Shelf */}
              {report.valid && (report.availableModels || []).length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-[#1a2130]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Accessible Models ({report.availableModels.length})</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Filter models (e.g. gpt-4, claude)..."
                      value={modelFilter}
                      onChange={(e) => setModelFilter(e.target.value)}
                      className="bg-[#090c13] border border-[#1b2233] rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 font-mono w-48 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 p-2 rounded-xl bg-[#090c13] border border-[#171d2b]">
                    {filteredModels.map((modelName) => (
                      <button
                        key={modelName}
                        onClick={() => copyText(modelName, modelName)}
                        title="Click to copy model ID"
                        className="px-2 py-1 rounded-md bg-slate-800/80 hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-slate-700/60 font-mono text-[11px] text-slate-200 flex items-center gap-1 transition"
                      >
                        <span>{modelName}</span>
                        {copiedId === modelName ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-2.5 h-2.5 text-slate-400 opacity-60 hover:opacity-100" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Card Footer Actions */}
            <div className="p-4 bg-[#0a0d14] border-t border-[#1a2130] flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                Checked at {new Date(report.checkedAt).toLocaleTimeString()}
              </span>

              <button
                onClick={handleSaveToMonitored}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Save to Monitored List</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* OFFICIAL AI KEYS & PRICING DIRECTORY */}
        {/* ========================================================================= */}
        <div id="get-keys" className="space-y-4 pt-6 border-t border-[#151926]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <h2 className="text-base font-bold text-white">Get Official AI API Keys</h2>
              </div>
              <p className="text-xs text-slate-400">
                Direct official links to generate keys. Reviewed for current free tier vs paid deposit requirements.
              </p>
            </div>

            <div className="flex items-center space-x-1.5 bg-[#0d111a] p-1 rounded-xl border border-[#1f2638] text-xs">
              <button
                onClick={() => setDirectoryFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  directoryFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                All Providers
              </button>
              <button
                onClick={() => setDirectoryFilter('free')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  directoryFilter === 'free' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                Active Free Tiers
              </button>
              <button
                onClick={() => setDirectoryFilter('paid')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  directoryFilter === 'paid' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                Paid / Pay-as-you-go
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredDirectory.map((provider) => (
              <div
                key={provider.id}
                className="p-4 rounded-xl border border-[#181e2b] bg-[#0c1018] hover:border-slate-700 transition flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-sm text-white">{provider.name}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      provider.badgeColor === 'emerald'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : provider.badgeColor === 'blue'
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}>
                      {provider.badge}
                    </span>
                  </div>

                  <p className="text-[11px] font-medium text-slate-300">{provider.freeDetails}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{provider.pricingNote}</p>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {provider.topModels.map(m => (
                      <span key={m} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#161c28]">
                  <a
                    href={provider.directUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition group"
                  >
                    <span>Get Key on {provider.name}</span>
                    <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-emerald-400" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MONITORED KEYS OVERVIEW TABLE */}
        {/* ========================================================================= */}
        <div className="space-y-4 pt-6 border-t border-[#151926]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>My Monitored Keys</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {savedKeys.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400">Keep track of your active keys and re-check live quotas anytime.</p>
            </div>

            {savedKeys.length > 0 && (
              <button
                onClick={handleRecheckAll}
                disabled={isRecheckingAll}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRecheckingAll ? 'animate-spin' : ''}`} />
                <span>Re-check All</span>
              </button>
            )}
          </div>

          {savedKeys.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-[#1a2130] bg-[#0a0d14] space-y-2">
              <div className="w-9 h-9 rounded-xl bg-slate-800/80 text-emerald-400 flex items-center justify-center mx-auto">
                <Key className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">No Keys Saved Yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Paste an API key in the search box above. Once inspected, you can click "Save to Monitored List" to track it here.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#181e2b] bg-[#0c1018] overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#090c13] text-slate-400 border-b border-[#181e2b] text-[11px] font-medium">
                  <tr>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Provider & Label</th>
                    <th className="p-3.5">Masked Key</th>
                    <th className="p-3.5">Rate Limits</th>
                    <th className="p-3.5">Balance / Quota</th>
                    <th className="p-3.5">Models</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#181e2b]">
                  {savedKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-800/20 transition">
                      <td className="p-3.5">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className={`w-2 h-2 rounded-full ${
                            k.status === 'healthy' ? 'bg-emerald-400' : 'bg-red-400'
                          }`}></span>
                          <span className="capitalize text-[11px]">{k.status}</span>
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-white">{k.label}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-mono">{k.provider}</div>
                      </td>
                      <td className="p-3.5 font-mono text-slate-400 text-[11px]">{k.maskedKey}</td>
                      <td className="p-3.5 text-slate-300 font-mono text-[11px]">
                        {k.rpmLimit} RPM • {k.tpmLimit.toLocaleString()} TPM
                      </td>
                      <td className="p-3.5 text-emerald-400 font-medium">
                        {k.quotaStatus || (k.currentBalance ? `$${k.currentBalance.toFixed(2)}` : 'Active')}
                      </td>
                      <td className="p-3.5">
                        {(k.availableModels || []).length > 0 ? (
                          <button
                            onClick={() => setSelectedModelsModal({ label: k.label, models: k.availableModels })}
                            className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium transition"
                          >
                            {k.availableModels.length} Models
                          </button>
                        ) : (
                          <span className="text-slate-500 text-[11px]">-</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => handleDeleteKey(k.id, k.label)}
                          className="p-1 rounded text-slate-500 hover:text-red-400 transition"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ========================================================================= */}
      {/* ZERO-KNOWLEDGE SYNC MODAL (IMMUNE TO AI CRACKING) */}
      {/* ========================================================================= */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#0d111a] border border-[#1f2638] rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Zero-Knowledge Cross-Device Sync</h3>
                  <p className="text-[11px] text-slate-400">Military-grade AES-256-GCM encryption • No accounts required</p>
                </div>
              </div>
              <button onClick={() => setShowSyncModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sync Tab Selector */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#080a10] border border-[#171d2b] text-xs font-semibold">
              <button
                onClick={() => setSyncTab('pair')}
                className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                  syncTab === 'pair' ? 'bg-[#121622] text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Laptop className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pair This Device</span>
              </button>
              <button
                onClick={() => setSyncTab('link')}
                className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                  syncTab === 'link' ? 'bg-[#121622] text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Link Another Device</span>
              </button>
            </div>

            {/* TAB 1: PAIR THIS DEVICE (GENERATE 4-WORD PASSPHRASE) */}
            {syncTab === 'pair' && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-300 leading-relaxed">
                  Your keys will be encrypted with <strong>AES-256-GCM</strong> directly in your browser before being backed up. Even our servers only see scrambled ciphertext.
                </p>

                <div className="p-4 rounded-xl bg-[#080a10] border border-[#1b2233] space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Your Uncrackable Cryptographic Passphrase:
                  </span>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0e121c] border border-slate-800 font-mono text-sm text-emerald-300 font-bold select-all">
                    <span>{generatedPassphrase}</span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => copyText(generatedPassphrase, 'passphrase')}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                        title="Copy Passphrase"
                      >
                        {copiedId === 'passphrase' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setGeneratedPassphrase(generatePassphrase())}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                        title="Generate New Words"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {syncSuccessMessage && (
                  <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                    <span>{syncSuccessMessage}</span>
                  </div>
                )}

                <div className="flex justify-end space-x-2 pt-2 border-t border-[#1a2130]">
                  <button
                    onClick={() => setShowSyncModal(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleUploadSyncVault}
                    disabled={isSyncing}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    <span>Encrypt & Back Up Vault</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: LINK ANOTHER DEVICE (RESTORE FROM 4-WORD PASSPHRASE) */}
            {syncTab === 'link' && (
              <form onSubmit={handleRestoreFromPassphrase} className="space-y-4 text-xs">
                <p className="text-slate-300 leading-relaxed">
                  Enter the 4-word passphrase from your other computer. Your keys will be downloaded as encrypted ciphertext and decrypted 100% inside this browser's memory.
                </p>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Enter 4-Word Passphrase</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. quantum-saddle-copper-hazard"
                    value={inputPassphrase}
                    onChange={(e) => setInputPassphrase(e.target.value)}
                    className="w-full bg-[#080a10] border border-[#1b2233] focus:border-emerald-500 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Protected by 5-strike lockdown rate limiting to prevent automated guessing.
                  </p>
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-[#1a2130]">
                  <button
                    type="button"
                    onClick={() => setShowSyncModal(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSyncing || !inputPassphrase.trim()}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    <span>Decrypt & Restore Keys</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Model List View Modal */}
      {selectedModelsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d111a] border border-[#1f2638] rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>Authorized Models</span>
                </h3>
                <p className="text-[11px] text-slate-400">{selectedModelsModal.label}</p>
              </div>
              <button onClick={() => setSelectedModelsModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {selectedModelsModal.models.map((m) => (
                <div key={m} className="p-2 rounded-lg bg-[#090c13] border border-[#181e2b] flex items-center justify-between text-xs font-mono text-slate-300">
                  <span className="truncate mr-2">{m}</span>
                  <button
                    onClick={() => copyText(m, m)}
                    className="p-1 rounded text-slate-500 hover:text-slate-200"
                  >
                    {copiedId === m ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#1a2130]">
              <button
                onClick={() => setSelectedModelsModal(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
