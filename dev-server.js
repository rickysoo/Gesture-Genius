const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Import Neon database
const { neon } = require('@neondatabase/serverless');

// Import AWS SDK
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.AWS_S3_BUCKET;

const PORT = 3008;

// Secure CORS middleware
function cors(req, res) {
  // Allowed origins for development and production
  const allowedOrigins = [
    'http://localhost:3008',
    'http://127.0.0.1:3008',
    'https://gesture-genius-64oeq4qp5-rickys-projects-c77239e3.vercel.app',
    'https://gesture-genius-c0wvptgb0-rickys-projects-c77239e3.vercel.app',
    'https://gesture-genius-f1pvs4ojp-rickys-projects-c77239e3.vercel.app',
    'https://gesture-genius-ppfli0yh7-rickys-projects-c77239e3.vercel.app',
    'https://gesture-genius-bo77rbvnp-rickys-projects-c77239e3.vercel.app',
    'https://gesture-genius-rog748qge-rickys-projects-c77239e3.vercel.app',
    'https://gesture-genius-gd1s4stri-rickys-projects-c77239e3.vercel.app',
    'https://gesture-genius-rch9hdtr3-rickys-projects-c77239e3.vercel.app'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.setHeader('Access-Control-Allow-Credentials', 'false');
}

// OpenAI Chat proxy with fallback
async function chatHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, messages, temperature, max_tokens, response_format } = req.body;
    
    const requestBody = {
      model: model || 'gpt-4o-mini',
      messages,
      temperature,
      max_tokens,
      ...(response_format && { response_format })
    };
    
    // Try real OpenAI API with shorter timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const data = await response.json();
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('OpenAI Chat API failed:', {
        error: fetchError.message,
        timestamp: new Date().toISOString()
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat service temporarily unavailable' }));
      return;
    }
    
  } catch (error) {
    console.error('Chat API Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
  }
}

// OpenAI Images proxy with fallback
async function imagesHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, prompt, size, quality, n } = req.body;
    
    const requestBody = {
      model: model || 'dall-e-3',
      prompt,
      size: size || '1024x1024',
      quality: quality || 'standard',
      n: n || 1
    };
    
    // Try real OpenAI API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const data = await response.json();
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('OpenAI Images API failed:', {
        error: fetchError.message,
        timestamp: new Date().toISOString()
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image generation service temporarily unavailable' }));
      return;
    }
    
  } catch (error) {
    console.error('Images API Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
  }
}

// Database handler
async function databaseHandler(req, res, action) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    
    if (action === 'get-questions') {
      const { count = 5, excludeIds = [] } = req.body;
      
      let result;
      if (excludeIds && excludeIds.length > 0) {
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
      
      // Normalize options format and update reuse count
      if (result.length > 0) {
        const questionIds = result.map(q => q.id);
        
        // Normalize options format
        result.forEach(question => {
          if (question.options) {
            let options = question.options;
            
            // If options is a string, try to parse it
            if (typeof options === 'string') {
              try {
                options = JSON.parse(options);
              } catch (e) {
                console.warn('Failed to parse options for question', question.id);
              }
            }
            
            // Convert object format to array format for frontend
            if (options && typeof options === 'object' && !Array.isArray(options)) {
              question.options = [
                options.correct,
                options.close,
                options.wrong1 || options.obviouslyWrong,
                options.wrong2 || options.funnyWrong
              ].filter(opt => opt && opt.trim());
            }
          }
        });
        
        await sql`
          UPDATE quiz_data 
          SET reuse_count = reuse_count + 1 
          WHERE id = ANY(${questionIds})
        `;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        questions: result,
        count: result.length 
      }));
      
    } else if (action === 'save-question' || action === 'save-quiz') {
      const { question, imageUrl, image_url, gestureType, gesture_type, correctAnswer, correct_answer, options, explanation, coachingTips, coaching_tips, s3_key } = req.body;
      
      // Handle both save-question and save-quiz formats
      const finalImageUrl = imageUrl || image_url;
      const finalGestureType = gestureType || gesture_type;
      const finalCorrectAnswer = correctAnswer || correct_answer;
      const finalCoachingTips = coachingTips || coaching_tips;
      const finalS3Key = s3_key || 'legacy-key-' + Date.now();
      
      // Ensure options is properly formatted for JSON storage
      let finalOptions = options;
      if (Array.isArray(options)) {
        // Convert array to proper object format for consistency
        finalOptions = {
          correct: finalCorrectAnswer,
          close: options.find(opt => opt !== finalCorrectAnswer && opt.length > 10) || options[1],
          wrong1: options.find(opt => opt !== finalCorrectAnswer && opt.length < 10) || options[2],
          wrong2: options[options.length - 1]
        };
      }
      
      // Ensure coaching_tips is properly formatted for JSON storage
      let finalCoachingTipsJson = null;
      if (finalCoachingTips) {
        if (Array.isArray(finalCoachingTips)) {
          finalCoachingTipsJson = JSON.stringify(finalCoachingTips);
        } else if (typeof finalCoachingTips === 'string') {
          // If it's a string, wrap it in an array
          finalCoachingTipsJson = JSON.stringify([finalCoachingTips]);
        } else {
          finalCoachingTipsJson = JSON.stringify(finalCoachingTips);
        }
      }
      
      const result = await sql`
        INSERT INTO quiz_data (
          question, 
          image_url, 
          s3_key,
          gesture_type, 
          correct_answer, 
          options, 
          explanation, 
          coaching_tips,
          reuse_count
        ) VALUES (
          ${question}, 
          ${finalImageUrl}, 
          ${finalS3Key},
          ${finalGestureType}, 
          ${finalCorrectAnswer}, 
          ${JSON.stringify(finalOptions)}, 
          ${explanation}, 
          ${finalCoachingTipsJson},
          0
        ) RETURNING id
      `;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id: result[0]?.id }));
    }
  } catch (error) {
    console.error('Database error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Database service temporarily unavailable' }));
  }
}

// Storage handler with real S3 functionality
async function storageHandler(req, res, action) {
  try {
    if (action === 'upload') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const { imageUrl, filename } = req.body;
      
      if (!imageUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing imageUrl' }));
        return;
      }

      // Download image from OpenAI
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      
      // Generate S3 key
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
      const randomId = Math.random().toString(36).substring(2, 10);
      const s3Key = `${timestamp}-general-${randomId}.png`;

      // Upload to S3
      const putCommand = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: 'image/png',
      });

      await s3Client.send(putCommand);

      // Generate signed URL (7 days expiry)
      const getCommand = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      });
      
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 604800 });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        s3Url: signedUrl,
        s3Key: s3Key
      }));

    } else if (action === 'get-signed-url') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const { s3Url } = req.body;
      
      if (!s3Url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing s3Url' }));
        return;
      }

      // Extract S3 key from URL
      const s3Key = s3Url.split('/').pop().split('?')[0];
      
      // Generate new signed URL
      const getCommand = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      });
      
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 604800 });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        signedUrl: signedUrl
      }));

    } else if (action === 'proxy-image') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const parsedUrl = url.parse(req.url, true);
      const s3Url = parsedUrl.query.s3Url;
      
      if (!s3Url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing s3Url parameter' }));
        return;
      }

      // Extract S3 key from URL
      let s3Key;
      if (s3Url.includes('s3.amazonaws.com') || s3Url.includes('s3-')) {
        s3Key = s3Url.split('/').slice(-1)[0].split('?')[0];
      } else {
        throw new Error('Invalid S3 URL format');
      }

      // Get object from S3
      const getCommand = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      });

      const s3Response = await s3Client.send(getCommand);
      
      // Set secure CORS headers (already set by cors middleware above)
      res.setHeader('Content-Type', s3Response.ContentType || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      // Stream the image data
      const stream = s3Response.Body;
      if (stream) {
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        res.writeHead(200);
        res.end(buffer);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Image not found' }));
      }
    }
  } catch (error) {
    console.error('Storage error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Storage service temporarily unavailable' }));
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  cors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse request body for POST requests
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        req.body = JSON.parse(body || '{}');
      } catch (e) {
        req.body = {};
      }

      // Route API calls
      if (pathname === '/api/openai/chat') {
        chatHandler(req, res);
      } else if (pathname === '/api/openai/images') {
        imagesHandler(req, res);
      } else if (pathname === '/api/database/get-questions') {
        databaseHandler(req, res, 'get-questions');
      } else if (pathname === '/api/database/save-question') {
        databaseHandler(req, res, 'save-question');
      } else if (pathname === '/api/database/save-quiz') {
        databaseHandler(req, res, 'save-quiz');
      } else if (pathname === '/api/storage/upload') {
        storageHandler(req, res, 'upload');
      } else if (pathname === '/api/storage/get-signed-url') {
        storageHandler(req, res, 'get-signed-url');
      } else if (pathname === '/api/storage/proxy-image') {
        storageHandler(req, res, 'proxy-image');
      } else {
        // Serve static files
        serveStatic(req, res, pathname);
      }
    });
  } else {
    // Handle GET requests
    if (pathname === '/api/storage/proxy-image') {
      storageHandler(req, res, 'proxy-image');
    } else {
      // Serve static files for other GET requests
      serveStatic(req, res, pathname);
    }
  }
});

function serveStatic(req, res, pathname) {
  let filePath = '.' + pathname;
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

server.listen(PORT, () => {
  console.log(`🚀 Development server running at http://localhost:${PORT}/`);
  console.log(`✅ Environment variables loaded: ${process.env.OPENAI_API_KEY && process.env.DATABASE_URL && process.env.AWS_ACCESS_KEY_ID ? 'OK' : 'Check configuration'}`);
});