// app/api/process-file/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import fs from 'fs';
import { FilePurpose } from '@mistralai/mistralai/models/components/filepurpose';

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
    
    // Create temp directory if it doesn't exist
    const tempDir = join(process.cwd(), 'tmp');
    try {
      await mkdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
      throw error;
    }
    
    // Save file temporarily
    const filePath = join(tempDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);
    
    // Process with Mistral API
    const client = new Mistral({ apiKey });
    
    const uploadedFile = fs.readFileSync(filePath);
    const uploadedPdf = await client.files.upload({
      file: {
        fileName: file.name,
        content: uploadedFile,
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
      }
    });
    
    // Clean up
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Error deleting temporary file:', error);
    }
    
    return NextResponse.json(ocrResponse);
  } catch (error) {
    console.error('Error processing file:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'An error occurred processing the file' },
      { status: 500 }
    );
  }
}