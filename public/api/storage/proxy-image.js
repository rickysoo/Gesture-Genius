import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { secureEndpoint, validateRequired } from '../middleware/security.js';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION?.trim(),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  },
});

const BUCKET_NAME = 's3-ai-2025';

// Extract S3 key from various S3 URL formats
function extractS3Key(s3Url) {
  try {
    const url = new URL(s3Url);
    
    // Handle different S3 URL formats:
    // https://bucket.s3.region.amazonaws.com/key
    // https://bucket.s3.amazonaws.com/key
    // https://s3.region.amazonaws.com/bucket/key
    
    if (url.hostname.includes(BUCKET_NAME)) {
      // Format: https://bucket.s3.region.amazonaws.com/key
      return url.pathname.substring(1); // Remove leading slash
    } else if (url.hostname.startsWith('s3.')) {
      // Format: https://s3.region.amazonaws.com/bucket/key
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      if (pathParts[0] === BUCKET_NAME) {
        return pathParts.slice(1).join('/');
      }
    }
    
    throw new Error('Unrecognized S3 URL format');
  } catch (error) {
    throw new Error(`Invalid S3 URL: ${error.message}`);
  }
}

async function proxyImageHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { s3Url } = req.query;
    
    if (!s3Url) {
      return res.status(400).json({ error: 'Missing s3Url parameter' });
    }
    
    // Extract S3 key from URL
    const s3Key = extractS3Key(s3Url);
    
    console.log('Proxying S3 image:', { s3Key, originalUrl: s3Url });
    
    // Get object from S3
    const getObjectCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    
    console.log('Getting S3 object:', { bucket: BUCKET_NAME, key: s3Key });
    const startTime = Date.now();
    const response = await s3Client.send(getObjectCommand);
    console.log('S3 object retrieved in', Date.now() - startTime, 'ms');
    
    // Set appropriate headers
    res.setHeader('Content-Type', response.ContentType || 'image/png');
    res.setHeader('Content-Length', response.ContentLength);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    // Convert stream to buffer for more reliable handling
    const chunks = [];
    const stream = response.Body;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    console.log('Image buffer size:', buffer.length);
    
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
    
  } catch (error) {
    console.error('Proxy image error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      bucket: BUCKET_NAME
    });
    
    // Return appropriate error to client
    if (error.message.includes('NoSuchKey')) {
      res.status(404).json({ error: 'Image not found' });
    } else if (error.message.includes('credentials')) {
      res.status(503).json({ error: 'Storage service temporarily unavailable' });
    } else if (error.message.includes('Invalid S3 URL')) {
      res.status(400).json({ error: 'Invalid S3 URL format' });
    } else {
      res.status(500).json({ error: 'Failed to proxy image' });
    }
  }
}

export default secureEndpoint(proxyImageHandler);