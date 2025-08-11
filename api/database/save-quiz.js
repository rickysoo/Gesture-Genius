import { neon } from '@neondatabase/serverless';
import { secureEndpoint, validateRequired, sanitizeString, validateImageUrl } from '../middleware/security.js';

async function saveQuizHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      image_url,
      s3_key,
      question,
      options,
      correct_answer,
      gesture_type,
      dalle_prompt,
      scenario_prompt,
      explanation,
      coaching_tips
    } = req.body;

    // Validate required fields
    validateRequired(req.body, ['image_url', 's3_key', 'question', 'options', 'correct_answer']);

    // Validate and sanitize inputs
    if (!validateImageUrl(image_url)) {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    if (typeof s3_key !== 'string' || s3_key.length < 5 || s3_key.length > 200) {
      return res.status(400).json({ error: 'Invalid S3 key' });
    }

    if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
      return res.status(400).json({ error: 'Options must be an array with 2-10 items' });
    }

    // Sanitize string inputs
    const sanitizedData = {
      image_url: image_url.trim(),
      s3_key: s3_key.trim(),
      question: sanitizeString(question, 500),
      options: options.map(opt => sanitizeString(opt, 200)),
      correct_answer: sanitizeString(correct_answer, 200),
      gesture_type: gesture_type ? sanitizeString(gesture_type, 100) : null,
      dalle_prompt: dalle_prompt ? sanitizeString(dalle_prompt, 1000) : null,
      scenario_prompt: scenario_prompt ? sanitizeString(scenario_prompt, 1000) : null,
      explanation: explanation ? sanitizeString(explanation, 1000) : null,
      coaching_tips: Array.isArray(coaching_tips) ? 
        coaching_tips.map(tip => sanitizeString(tip, 300)) : null
    };

    // Verify correct_answer is in options
    if (!sanitizedData.options.includes(sanitizedData.correct_answer)) {
      return res.status(400).json({ error: 'Correct answer must be one of the provided options' });
    }

    const sql = neon(process.env.DATABASE_URL);
    
    // Insert quiz data into database with parameterized query
    const result = await sql`
      INSERT INTO quiz_data (
        image_url,
        s3_key,
        question,
        options,
        correct_answer,
        gesture_type,
        dalle_prompt,
        scenario_prompt,
        explanation,
        coaching_tips,
        created_at
      ) VALUES (
        ${sanitizedData.image_url},
        ${sanitizedData.s3_key},
        ${sanitizedData.question},
        ${JSON.stringify(sanitizedData.options)},
        ${sanitizedData.correct_answer},
        ${sanitizedData.gesture_type},
        ${sanitizedData.dalle_prompt},
        ${sanitizedData.scenario_prompt},
        ${sanitizedData.explanation},
        ${sanitizedData.coaching_tips ? JSON.stringify(sanitizedData.coaching_tips) : null},
        NOW()
      )
      RETURNING id, created_at
    `;

    if (!result || result.length === 0) {
      throw new Error('Failed to insert data');
    }

    res.status(201).json({
      success: true,
      id: result[0].id,
      created_at: result[0].created_at,
      message: 'Quiz data saved successfully'
    });
    
  } catch (error) {
    // Log error details server-side only
    console.error('Database save error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Return generic error to client
    if (error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
      res.status(409).json({ error: 'Quiz data already exists' });
    } else {
      res.status(500).json({ error: 'Failed to save quiz data' });
    }
  }
}

export default secureEndpoint(saveQuizHandler);