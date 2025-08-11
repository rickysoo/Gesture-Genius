import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { count = 5, excludeIds = [] } = req.body;
    const sql = neon(process.env.DATABASE_URL);
    
    // Get random questions excluding specified IDs
    let excludeCondition = '';
    let queryParams = [count];
    
    if (excludeIds && excludeIds.length > 0) {
      excludeCondition = `WHERE id NOT IN (${excludeIds.map((_, i) => `$${i + 2}`).join(', ')})`;
      queryParams.push(...excludeIds);
    }
    
    const result = await sql`
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
      ${excludeCondition ? sql.unsafe(excludeCondition) : sql``}
      ORDER BY RANDOM() 
      LIMIT ${sql.unsafe('$1')}
    `.bind(queryParams);
    
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
    console.error('Database get-questions error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve questions', 
      details: error.message 
    });
  }
}