import { neon } from '@neondatabase/serverless';
import { secureEndpoint, validateRequired } from '../middleware/security.js';

async function getQuestionsHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { count = 5, excludeIds = [] } = req.body;
    
    // Validate input parameters
    if (typeof count !== 'number' || count < 1 || count > 50) {
      return res.status(400).json({ error: 'Count must be a number between 1 and 50' });
    }
    
    if (excludeIds && (!Array.isArray(excludeIds) || excludeIds.some(id => typeof id !== 'number'))) {
      return res.status(400).json({ error: 'excludeIds must be an array of numbers' });
    }
    const sql = neon(process.env.DATABASE_URL);
    
    // Get random questions excluding specified IDs
    let result;
    
    if (excludeIds && excludeIds.length > 0) {
      // Create a PostgreSQL array from the excluded IDs
      result = await sql`
        SELECT 
          id,
          image_url,
          question,
          options,
          correct_answer,
          gesture_type,
          explanation,
          coaching_tips,
          reuse_count
        FROM quiz_data 
        WHERE id != ALL(${excludeIds})
        ORDER BY RANDOM() 
        LIMIT ${count}
      `;
    } else {
      result = await sql`
        SELECT 
          id,
          image_url,
          question,
          options,
          correct_answer,
          gesture_type,
          explanation,
          coaching_tips,
          reuse_count
        FROM quiz_data 
        ORDER BY RANDOM() 
        LIMIT ${count}
      `;
    }
    
    // Update reuse count for retrieved questions
    if (result.length > 0) {
      const questionIds = result.map(q => q.id);
      await sql`
        UPDATE quiz_data 
        SET reuse_count = reuse_count + 1 
        WHERE id = ANY(${questionIds})
      `;
    }
    
    res.json({ 
      success: true, 
      questions: result,
      count: result.length 
    });
  } catch (error) {
    console.error('Database get-questions error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Return generic error to client
    res.status(500).json({ error: 'Failed to retrieve questions' });
  }
}

export default secureEndpoint(getQuestionsHandler);