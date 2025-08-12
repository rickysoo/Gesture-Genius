import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

async function getSignedUrlHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { s3Url } = req.body;
    
    // Validate required fields
    validateRequired(req.body, ['s3Url']);
    
    // Extract S3 key from URL
    const s3Key = extractS3Key(s3Url);
    
    // Generate signed URL
    const getObjectCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    
    const signedUrl = await getSignedUrl(s3Client, getObjectCommand, { 
      expiresIn: 7 * 24 * 60 * 60 // 7 days
    });
    
    res.status(200).json({
      success: true,
      signedUrl,
      s3Key,
      expiresIn: 7 * 24 * 60 * 60
    });
    
  } catch (error) {
    console.error('Get signed URL error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      bucket: BUCKET_NAME
    });
    
    // Return appropriate error to client
    if (error.message.includes('credentials')) {
      res.status(503).json({ error: 'Storage service temporarily unavailable' });
    } else if (error.message.includes('Invalid S3 URL')) {
      res.status(400).json({ error: 'Invalid S3 URL format' });
    } else {
      res.status(500).json({ error: 'Failed to generate signed URL' });
    }
  }
}

export default secureEndpoint(getSignedUrlHandler);