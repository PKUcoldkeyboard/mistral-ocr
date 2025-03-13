// /api/upload-image/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'edge'; 

console.log('S3 Configuration:', {
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE,
  bucket: process.env.S3_BUCKET_NAME
});

// Set up S3 S3 client
const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
  endpoint: process.env.S3_ENDPOINT ? `https://${process.env.S3_ENDPOINT}` : undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});

export async function POST(request: NextRequest) {
  try {
    // Check if environment variables are properly set
    if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
      return NextResponse.json(
        { message: 'Server configuration error: Missing S3 credentials or bucket name' },
        { status: 500 }
      );
    }

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { message: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file is an image
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { message: 'File must be an image' },
        { status: 400 }
      );
    }

    // Get file extension from MIME type
    const fileExtension = file.type.split('/')[1] || 'jpg';

    // Create a unique file name
    const prefix = process.env.S3_PREFIX ? `${process.env.S3_PREFIX}/` : '';
    const fileName = `${prefix}${uuidv4()}.${fileExtension}`;

    // Get the file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to S3
    const bucketParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: file.type
    };

    await s3Client.send(new PutObjectCommand(bucketParams));

    // Create the public URL based on configuration
    let imageUrl;

    if (process.env.S3_PUBLIC_URL) {
      // Use custom URL format if provided
      imageUrl = `${process.env.S3_PUBLIC_URL}/${fileName}`;
    } else if (process.env.S3_ENDPOINT) {
      // For third-party S3 services
      if (process.env.S3_FORCE_PATH_STYLE === 'true') {
        // Path-style URL format
        imageUrl = `https://${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${fileName}`;
      } else {
        // Virtual-hosted style URL format
        imageUrl = `https://${process.env.S3_BUCKET_NAME}.${process.env.S3_ENDPOINT}/${fileName}`;
      }
    } else {
      // Default AWS S3 URL format
      imageUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
    }

    return NextResponse.json({
      success: true,
      imageUrl
    });
  } catch (error) {
    console.error('Error uploading to S3:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'An error occurred during file upload' },
      { status: 500 }
    );
  }
}

// Increase the limit for uploads if needed
export const config = {
  api: {
    bodyParser: false,
    responseLimit: '10mb',
  },
};