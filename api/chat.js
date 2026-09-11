export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const hfSpaceUrl = process.env.HF_SPACE_URL; // e.g. https://yourname-eranatis-backend.hf.space
  if (!groqKey && !openaiKey && !hfSpaceUrl) {
    res.status(500).json({ error: 'No API key set on the server (GROQ_API_KEY, OPENAI_API_KEY, or HF_SPACE_URL).' });
    return;
  }

  const { system, message } = req.body || {};
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const systemPrompt = system || 'You are Eranatis, a helpful AI writing assistant.';
  const chatMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ];

  async function tryGroq() {
    if (!groqKey) throw new Error('no-groq-key');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: chatMessages,
        max_tokens: 1200,
        temperature: 0.7
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'groq-failed');
    const txt = data?.choices?.[0]?.message?.content?.trim();
    if (!txt) throw new Error('empty-response');
    return txt;
  }

  async function tryOpenAI() {
    if (!openaiKey) throw new Error('no-openai-key');
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: chatMessages,
        max_tokens: 1200,
        temperature: 0.7
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'openai-failed');
    const txt = data?.choices?.[0]?.message?.content?.trim();
    if (!txt) throw new Error('empty-response');
    return txt;
  }

  async function tryHFSpace() {
    if (!hfSpaceUrl) throw new Error('no-hf-space-url');
    const r = await fetch(`${hfSpaceUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt, message })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'hf-space-failed');
    const txt = data?.reply?.trim();
    if (!txt) throw new Error('empty-response');
    return txt;
  }

  // Order: Groq (free, fast) -> OpenAI (paid, only if credits added) -> HF Space (free, slow, self-hosted)
  const errors = {};
  try {
    const reply = await tryGroq();
    return res.status(200).json({ reply });
  } catch (e) { errors.groq = e.message; }

  try {
    const reply = await tryOpenAI();
    return res.status(200).json({ reply });
  } catch (e) { errors.openai = e.message; }

  try {
    const reply = await tryHFSpace();
    return res.status(200).json({ reply });
  } catch (e) { errors.hf = e.message; }

  res.status(500).json({ error: `All providers failed. Groq: ${errors.groq} | OpenAI: ${errors.openai} | HF Space: ${errors.hf}` });
}
