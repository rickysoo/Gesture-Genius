import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    
    // Create quiz_data table
    await sql`
      CREATE TABLE IF NOT EXISTS quiz_data (
        id SERIAL PRIMARY KEY,
        image_url TEXT NOT NULL,
        s3_key TEXT NOT NULL,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_answer TEXT NOT NULL,
        gesture_type VARCHAR(100),
        dalle_prompt TEXT,
        scenario_prompt TEXT,
        explanation TEXT,
        coaching_tips JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        reuse_count INT DEFAULT 0
      )
    `;

    // Create indexes for efficient querying
    await sql`CREATE INDEX IF NOT EXISTS idx_gesture_type ON quiz_data(gesture_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_created_at ON quiz_data(created_at)`;
    
    res.json({ success: true, message: 'Database schema created successfully' });
  } catch (error) {
    console.error('Database setup error:', error);
    res.status(500).json({ error: 'Failed to set up database', details: error.message });
  }
}