export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!groqKey && !openaiKey) {
    res.status(500).json({ error: 'No API key set on the server (GROQ_API_KEY or OPENAI_API_KEY).' });
    return;
  }

  const { system, message } = req.body || {};
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const chatMessages = [
    { role: 'system', content: system || 'You are Eranatis, a helpful AI writing assistant.' },
    { role: 'user', content: message }
  ];

  async function tryGroq() {
    if (!groqKey) throw new Error('no-groq-key');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
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

  try {
    const reply = await tryGroq();
    res.status(200).json({ reply });
  } catch (groqErr) {
    try {
      const reply = await tryOpenAI();
      res.status(200).json({ reply });
    } catch (openaiErr) {
      res.status(500).json({ error: `Both providers failed. Groq: ${groqErr.message} | OpenAI: ${openaiErr.message}` });
    }
  }
}
