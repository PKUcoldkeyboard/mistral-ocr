// app/api/process-file/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { FilePurpose } from '@mistralai/mistralai/models/components/filepurpose';

export const runtime = 'edge'; 

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const apiKey = formData.get('apiKey') as string;
    
    if (!file || !apiKey) {
      return NextResponse.json(
        { message: 'File and API key are required' },
        { status: 400 }
      );
    }
    
    // 直接从文件获取 buffer，不写入文件系统
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 处理 Mistral API
    const client = new Mistral({ apiKey });
    
    const uploadedPdf = await client.files.upload({
      file: {
        fileName: file.name,
        content: buffer,
      },
      purpose: 'ocr' as FilePurpose,
    });
    
    const signedUrl = await client.files.getSignedUrl({
      fileId: uploadedPdf.id,
    });
    
    const ocrResponse = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: signedUrl.url,
      },
      includeImageBase64: true
    });
    
    return NextResponse.json(ocrResponse);
  } catch (error) {
    console.error('Error processing file:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'An error occurred processing the file' },
      { status: 500 }
    );
  }
}