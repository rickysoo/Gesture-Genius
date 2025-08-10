export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Proxy failure' });
  }
}
