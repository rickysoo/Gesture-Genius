import { secureEndpoint, validateRequired, sanitizeString } from './middleware/security.js';

async function legacyImagesHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate required fields
    validateRequired(req.body, ['prompt']);
    
    // Validate and sanitize input
    const { prompt, model, size, quality, n } = req.body;
    
    // Sanitize prompt (remove any potentially harmful content)
    const sanitizedPrompt = sanitizeString(prompt, 1000);
    if (sanitizedPrompt.length < 10) {
      return res.status(400).json({ error: 'Prompt too short or invalid' });
    }
    
    // Validate model if specified
    const allowedModels = ['dall-e-2', 'dall-e-3'];
    const validModel = typeof model === 'string' && allowedModels.includes(model) ? model : 'dall-e-3';
    
    // Validate size if specified
    const allowedSizes = ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'];
    const validSize = typeof size === 'string' && allowedSizes.includes(size) ? size : '1024x1024';
    
    // Validate quality if specified (DALL-E 3 only)
    const allowedQualities = ['standard', 'hd'];
    const validQuality = typeof quality === 'string' && allowedQualities.includes(quality) ? quality : 'standard';
    
    // Validate number of images (limit to reasonable amount)
    const validN = typeof n === 'number' && n >= 1 && n <= 4 ? n : 1;
    
    // Build validated request body
    const requestBody = {
      prompt: sanitizedPrompt,
      model: validModel,
      size: validSize,
      quality: validQuality,
      n: validN
    };

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    const data = await response.text();
    res.status(response.status).json(data ? JSON.parse(data) : { error: 'Empty response' });
    
  } catch (error) {
    console.error('Legacy Images API Error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Service temporarily unavailable' });
  }
}

export default secureEndpoint(legacyImagesHandler);
