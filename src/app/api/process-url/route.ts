// app/api/process-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';

export async function POST(request: NextRequest) {
  try {
    const { apiKey, documentUrl } = await request.json();
    
    if (!apiKey || !documentUrl) {
      return NextResponse.json(
        { message: 'API key and document URL are required' },
        { status: 400 }
      );
    }
    
    const client = new Mistral({ apiKey });
    
    const ocrResponse = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl
      },
      includeImageBase64: false
    });
    
    return NextResponse.json(ocrResponse);
  } catch (error) {
    console.error('Error processing URL:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'An error occurred processing the document' },
      { status: 500 }
    );
  }
}