import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION?.trim(),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  },
});

// Generate filename with format: {datetime}-{type}-{uuid}.png
function generateFilename(gestureType) {
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
  
  // Clean gesture type for filename
  const type = gestureType?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'unknown';
  
  return `${datetime}-${type}-${uuid}.png`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { imageUrl, gestureType } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    // Download image from DALL-E URL
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    
    // Generate S3 key with specified format
    const filename = generateFilename(gestureType);
    const s3Key = filename;
    
    // Upload to S3
    const uploadParams = {
      Bucket: 's3-ai-2025',
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);
    
    // Generate S3 URL
    const s3Url = `https://s3-ai-2025.s3.us-east-1.amazonaws.com/${s3Key}`;
    
    res.json({
      success: true,
      s3Url,
      s3Key,
      filename,
      size: imageBuffer.length
    });
    
  } catch (error) {
    console.error('S3 upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload image to S3', 
      details: error.message 
    });
  }
}