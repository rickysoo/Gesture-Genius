import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
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
    if (!image_url || !s3_key || !question || !options || !correct_answer) {
      return res.status(400).json({ 
        error: 'Missing required fields: image_url, s3_key, question, options, correct_answer' 
      });
    }

    const sql = neon(process.env.DATABASE_URL);
    
    // Insert quiz data into database
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
        coaching_tips
      ) VALUES (
        ${image_url},
        ${s3_key},
        ${question},
        ${JSON.stringify(options)},
        ${correct_answer},
        ${gesture_type || null},
        ${dalle_prompt || null},
        ${scenario_prompt || null},
        ${explanation || null},
        ${coaching_tips ? JSON.stringify(coaching_tips) : null}
      )
      RETURNING id, created_at
    `;

    res.json({
      success: true,
      id: result[0].id,
      created_at: result[0].created_at,
      message: 'Quiz data saved successfully'
    });
    
  } catch (error) {
    console.error('Database save error:', error);
    res.status(500).json({ 
      error: 'Failed to save quiz data', 
      details: error.message 
    });
  }
}