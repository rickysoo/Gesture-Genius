import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { secureEndpoint, validateRequired, sanitizeString, validateImageUrl } from '../middleware/security.js';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION?.trim(),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  },
});

// Allowed file types and size limits
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_FILE_SIZE = 1024; // 1KB
const BUCKET_NAME = 's3-ai-2025';

// Validate image content type from buffer
function validateImageBuffer(buffer) {
  if (buffer.length < MIN_FILE_SIZE || buffer.length > MAX_FILE_SIZE) {
    return false;
  }
  
  // Check for common image file signatures
  const header = buffer.slice(0, 8);
  
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
    return 'image/png';
  }
  
  // JPEG signature: FF D8 FF
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
    return 'image/jpeg';
  }
  
  // WebP signature: 52 49 46 46 [4 bytes] 57 45 42 50
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }
  
  return false;
}

// Generate secure filename with format: {datetime}-{type}-{uuid}.png
function generateSecureFilename(gestureType) {
  // Get current time in Malaysia timezone (MYT - UTC+8)
  const now = new Date();
  const myt = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  
  // Format: YYYYMMDD-HHmmss
  const datetime = myt.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15); // 20250810-124511
  
  // Generate UUID (first 8 characters)
  const uuid = crypto.randomUUID().slice(0, 8);
  
  // Clean and sanitize gesture type for filename (strict validation)
  const type = typeof gestureType === 'string' ? 
    gestureType.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) : 'unknown';
  
  return `${datetime}-${type}-${uuid}.png`;
}

async function uploadHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageUrl, gestureType } = req.body;
    
    // Validate required fields
    validateRequired(req.body, ['imageUrl']);
    
    // Validate image URL
    if (!validateImageUrl(imageUrl)) {
      return res.status(400).json({ error: 'Invalid or unsafe image URL' });
    }
    
    // Validate gesture type if provided
    if (gestureType && (typeof gestureType !== 'string' || gestureType.length > 100)) {
      return res.status(400).json({ error: 'Invalid gesture type' });
    }
    
    // Only allow images from OpenAI domains for security
    const allowedDomains = ['oaidalleapiprodscus.blob.core.windows.net', 'cdn.openai.com'];
    const urlObj = new URL(imageUrl);
    if (!allowedDomains.includes(urlObj.hostname)) {
      return res.status(400).json({ error: 'Image source not allowed' });
    }

    // Download image from DALL-E URL with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const imageResponse = await fetch(imageUrl, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'GestureGenius/1.0'
        }
      });
      clearTimeout(timeoutId);
      
      if (!imageResponse.ok) {
        throw new Error(`HTTP ${imageResponse.status}`);
      }
      
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      
      // Validate image buffer
      const detectedType = validateImageBuffer(imageBuffer);
      if (!detectedType) {
        return res.status(400).json({ error: 'Invalid or corrupted image file' });
      }
      
      // Generate secure filename
      const filename = generateSecureFilename(sanitizeString(gestureType, 50));
      const s3Key = filename;
      
      // Upload to S3 with security headers
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: detectedType,
        CacheControl: 'public, max-age=31536000', // Cache for 1 year
        ServerSideEncryption: 'AES256',
        Metadata: {
          'uploaded-by': 'gesture-genius',
          'upload-timestamp': new Date().toISOString(),
          'content-validated': 'true'
        }
      };

      const command = new PutObjectCommand(uploadParams);
      await s3Client.send(command);
      
      // Generate signed S3 URL for secure access (valid for 7 days)
      const getObjectCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });
      
      const signedUrl = await getSignedUrl(s3Client, getObjectCommand, { 
        expiresIn: 7 * 24 * 60 * 60 // 7 days
      });
      
      res.status(201).json({
        success: true,
        s3Url: signedUrl,
        s3Key,
        filename,
        size: imageBuffer.length,
        contentType: detectedType
      });
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return res.status(408).json({ error: 'Image download timeout' });
      }
      throw fetchError;
    }
    
  } catch (error) {
    // Log error details server-side only
    console.error('S3 upload error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      bucket: BUCKET_NAME
    });
    
    // Return generic error to client
    if (error.message.includes('credentials')) {
      res.status(503).json({ error: 'Storage service temporarily unavailable' });
    } else if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
      res.status(408).json({ error: 'Upload timeout' });
    } else if (error.message.includes('HTTP 4')) {
      res.status(400).json({ error: 'Invalid image source' });
    } else {
      res.status(500).json({ error: 'Upload failed' });
    }
  }
}

export default secureEndpoint(uploadHandler);