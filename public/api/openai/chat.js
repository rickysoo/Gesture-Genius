const { secureEndpoint, validateRequired, sanitizeString } = require('../middleware/security');

async function chatHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate required fields
    validateRequired(req.body, ['model', 'messages']);
    
    // Validate and sanitize input
    const { model, messages, temperature, max_tokens } = req.body;
    
    if (typeof model !== 'string' || !['gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo'].includes(model)) {
      return res.status(400).json({ error: 'Invalid model specified' });
    }
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages must be a non-empty array' });
    }
    
    // Sanitize message content
    const sanitizedMessages = messages.map(msg => ({
      role: ['system', 'user', 'assistant'].includes(msg.role) ? msg.role : 'user',
      content: sanitizeString(msg.content, 4000)
    }));
    
    // Validate temperature and max_tokens if provided
    const requestBody = {
      model,
      messages: sanitizedMessages,
      ...(typeof temperature === 'number' && temperature >= 0 && temperature <= 2 && { temperature }),
      ...(typeof max_tokens === 'number' && max_tokens > 0 && max_tokens <= 4000 && { max_tokens })
    };
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    const data = await response.text();
    
    // Pass through OpenAI's response status and data
    res.status(response.status).json(data ? JSON.parse(data) : { error: 'Empty response' });
    
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Service temporarily unavailable' });
  }
}

export default secureEndpoint(chatHandler);
