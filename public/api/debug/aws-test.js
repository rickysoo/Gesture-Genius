import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    console.log('Testing AWS credentials...');
    console.log('Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? 'Present' : 'Missing');
    console.log('Secret Key:', process.env.AWS_SECRET_ACCESS_KEY ? 'Present' : 'Missing');
    console.log('Region:', process.env.AWS_REGION);
    
    // Initialize S3 client
    const s3Client = new S3Client({
      region: process.env.AWS_REGION?.trim(),
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),
      },
    });

    // Test credentials by listing buckets
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);
    
    console.log('AWS credentials valid! Found buckets:', response.Buckets?.length || 0);
    
    res.json({
      success: true,
      message: 'AWS credentials are valid',
      buckets: response.Buckets?.map(b => b.Name) || []
    });
    
  } catch (error) {
    console.error('AWS credentials test failed:', error);
    res.status(500).json({ 
      error: 'AWS credentials test failed', 
      details: error.message,
      code: error.name
    });
  }
}