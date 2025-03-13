import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';

export const runtime = 'edge'; 

export async function POST(request: NextRequest) {
  try {
    const { apiKey, imageUrl } = await request.json();
    
    if (!apiKey || !imageUrl) {
      return NextResponse.json(
        { message: 'API key and image URL are required' },
        { status: 400 }
      );
    }
    
    const client = new Mistral({ apiKey });
    
    const ocrResponse = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "image_url",
        imageUrl
      }
    });
    
    return NextResponse.json(ocrResponse);
  } catch (error) {
    console.error('Error processing image:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'An error occurred processing the image' },
      { status: 500 }
    );
  }
}