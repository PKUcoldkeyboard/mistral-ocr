"use client";
import React, { useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileUp, Globe, Image, Download, Key, HelpCircle, Info, Languages } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Home() {
  interface ImageData {
    id: string;
    top_left_x: number;
    top_left_y: number;
    bottom_right_x: number;
    bottom_right_y: number;
    imageBase64: string;
  }

  interface PageData {
    index: number;
    markdown: string;
    images?: ImageData[];
  }

  interface ResultData {
    pages: PageData[];
  }

  const [apiKey, setApiKey] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [translatedResult, setTranslatedResult] = useState<ResultData | null>(null);
  const [alert, setAlert] = useState<{ type: 'error' | 'success' | 'warning', message: string } | null>(null);

  // 新增翻译引擎相关状态
  const [translationEngine, setTranslationEngine] = useState<'openai' | 'deeplx'>('openai');
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("https://api.openai.com/v1");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [deeplxApiKey, setDeeplxApiKey] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("ZH"); // 默认目标语言

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];

      // Validate that it's a PDF
      if (!selectedFile.type.includes('pdf')) {
        setAlert({
          type: 'error',
          message: 'Invalid file type. Please upload a PDF file.'
        });
        setTimeout(() => setAlert(null), 5000); // Auto dismiss after 5 seconds
        return;
      }

      setFile(selectedFile);
    }
  };
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];

      // Validate that it's a PDF
      if (!selectedFile.type.includes('image')) {
        setAlert({
          type: 'error',
          message: 'Invalid file type. Please upload a image file.'
        });
        setTimeout(() => setAlert(null), 5000); // Auto dismiss after 5 seconds
        return;
      }

      setImageFile(e.target.files[0]);
    }
  };

  const uploadImageToS3 = async () => {
    if (!imageFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', imageFile);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to upload image");
      }

      const data = await response.json();
      setImageUrl(data.imageUrl);
      toast("Image Uploaded", {
        description: "Image uploaded successfully and URL copied to the field"
      });
      return data.imageUrl;
    } catch (error) {
      toast("Upload Error", {
        description: error instanceof Error ? error.message : "An unknown error occurred"
      });
      return null;
    } finally {
      setUploading(false);
    }
  };
  const handleProcessDocument = async (type: 'url' | 'file' | 'image') => {
    if (!apiKey) {
      toast("API Key Required", {
        description: "Please enter your Mistral API key"
      });
      return;
    }

    setLoading(true);
    setAlert(null); // Clear any existing alerts

    try {
      let response;
      switch (type) {
        case 'url':
          if (!pdfUrl) {
            throw new Error("PDF URL is required");
          }
          response = await fetch('/api/process-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ apiKey, documentUrl: pdfUrl }),
          });
          break;
        case 'file':
          if (!file) {
            throw new Error("File is required");
          }
          const formData = new FormData();
          formData.append('file', file);
          formData.append('apiKey', apiKey);
          response = await fetch('/api/process-file', {
            method: 'POST',
            body: formData,
          });
          break;
        case 'image':
          // If we have an image file but no URL yet, upload it first
          let finalImageUrl = imageUrl;
          if (imageFile && !imageUrl) {
            finalImageUrl = await uploadImageToS3();
            if (!finalImageUrl) {
              throw new Error("Failed to upload image");
            }
          }

          if (!finalImageUrl) {
            throw new Error("Image URL is required");
          }

          response = await fetch('/api/process-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ apiKey, imageUrl: finalImageUrl }),
          });
          break;
      }
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to process document");
      }
      const data = await response.json();
      setResult(data);
      setTranslatedResult(null); // Reset translated result when new document is processed
      toast("Success!", {
        description: `Document processed successfully. Found ${data.pages.length} pages.`
      });
    } catch (error) {
      toast("Error", {
        description: error instanceof Error ? error.message : "An unknown error occurred"
      });
    } finally {
      setLoading(false);
    }
  };

  const translateMarkdown = async () => {
    if (!result) return;

    // 验证翻译引擎所需的API密钥
    if (translationEngine === 'openai' && !openaiApiKey) {
      toast("API Key Required", {
        description: "Please enter your OpenAI API key"
      });
      return;
    } else if (translationEngine === 'deeplx' && !deeplxApiKey) {
      toast("API Key Required", {
        description: "Please enter your DeepL X API key"
      });
      return;
    }

    setTranslating(true);
    try {
      // 创建结果的深拷贝以生成翻译版本
      const originalContent = result.pages.map(page => page.markdown).join('\n\n---\n\n');

      // 调用翻译API
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          engine: translationEngine,
          openaiApiKey: translationEngine === 'openai' ? openaiApiKey : undefined,
          openaiBaseUrl: translationEngine === 'openai' ? openaiBaseUrl : undefined,
          openaiModel: translationEngine === 'openai' ? openaiModel : undefined,
          deeplxApiKey: translationEngine === 'deeplx' ? deeplxApiKey : undefined,
          content: originalContent,
          targetLanguage: targetLanguage
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to translate content");
      }

      const data = await response.json();

      // 将翻译内容拆分回与原始结构匹配的页面
      const translatedPages = result.pages.map((page, index) => {
        return {
          index: page.index,
          markdown: data.translatedPages[index] || "Translation failed for this page"
        };
      });

      setTranslatedResult({ pages: translatedPages });
      toast("Translation Complete", {
        description: "Document has been translated successfully"
      });
    } catch (error) {
      toast("Translation Error", {
        description: error instanceof Error ? error.message : "An unknown error occurred"
      });
    } finally {
      setTranslating(false);
    }
  };

  const downloadMarkdownWithImages = async (translated = false) => {
    const contentToDownload = translated ? translatedResult : result;
    if (!contentToDownload) return;

    setLoading(true);
    try {
      const zip = new JSZip();

      // 创建一个数组来存储所有的markdown内容
      const markdownContents: string[] = [];

      // 处理每一页
      contentToDownload.pages
        .sort((a, b) => a.index - b.index)
        .forEach(page => {
          const pageMarkdown = `## Page ${page.index}\n\n${page.markdown}`;
          markdownContents.push(pageMarkdown);
        });
      
      if (result) {
        result.pages
          .forEach(page => {
              // 处理图片（如果存在）
              if (page.images && page.images.length > 0) {
                // 处理每个图片
                page.images.forEach((img) => {
                  // 将base64转换为二进制
                  if (img.imageBase64) {
                    // 如果存在数据URL前缀，则移除
                    const base64Data = img.imageBase64.includes('base64,')
                      ? img.imageBase64.split('base64,')[1]
                      : img.imageBase64;
    
                    // 将图片添加到zip的根目录中
                    zip.file(img.id, base64Data, { base64: true });
                  }
                });
              }
          })
      }

      // 合并所有markdown内容
      const combinedMarkdown = markdownContents.join('\n\n---\n\n');

      // 将合并后的markdown文件添加到zip的根目录
      zip.file("document.md", combinedMarkdown);

      // 生成zip文件
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // 保存zip文件
      saveAs(zipBlob, translated ? 'ocr-results-translated.zip' : 'ocr-results.zip');

      toast("Download Started", {
        description: `Your ${translated ? 'translated ' : ''}document with images is being downloaded as a zip file`
      });
    } catch (error) {
      console.error("Error creating zip file:", error);
      toast("Download Error", {
        description: "Failed to create zip file. " + (error instanceof Error ? error.message : "Unknown error")
      });
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
  };

  const clearImageFile = () => {
    setImageFile(null);
    setImageUrl("");
  };
  const dismissAlert = () => {
    setAlert(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-2 md:p-4">
      {alert && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-0 left-0 right-0 z-50 flex justify-center py-2"
        >
          <Alert
            variant={alert.type === 'error' ? 'destructive' : alert.type === 'warning' ? 'default' : 'default'}
            className="max-w-2xl shadow-md backdrop-blur-sm bg-background/95"
          >
            <AlertTitle className="flex items-center gap-2">
              {alert.type === 'error' && <FileUp className="h-4 w-4" />}
              {alert.type === 'error' ? 'Error' : alert.type === 'warning' ? 'Warning' : 'Information'}
            </AlertTitle>
            <AlertDescription className="flex justify-between items-center">
              <span>{alert.message}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={dismissAlert}
                className="h-6 p-0 px-2"
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        </motion.div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto"
      >
        <Card className="shadow-md border-none">
          <CardHeader className="bg-[#4285F4] text-white rounded-t-lg py-4">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl font-bold">Mistral OCR Processor</CardTitle>
                <CardDescription className="text-white/90 text-sm">Extract text from documents using Mistral AI&apos;s OCR API</CardDescription>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white/90 hover:text-white hover:bg-white/10">
                      <HelpCircle size={20} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>This tool uses Mistral AI to extract text from PDFs and images. You&apos;ll need a Mistral API key to use it.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="apiKey" className="text-sm font-medium flex items-center gap-1">
                  <Key size={14} />
                  <span>Mistral API Key</span>
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-500">
                        <Info size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Your API key is required but never stored on our servers.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your Mistral API key"
                value={apiKey}
                onChange={handleApiKeyChange}
                className="bg-gray-50 focus:ring-2 focus:ring-[#4285F4] text-sm"
              />
            </div>

            {/* 翻译引擎设置部分 */}
            <div className="mb-4 border p-3 rounded-md bg-gray-50">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Languages size={14} />
                <span>Translation Engine Settings</span>
              </h3>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="translationEngine" className="text-xs font-medium mb-1 block">Translation Engine</Label>
                  <Select
                    value={translationEngine}
                    onValueChange={(value) => setTranslationEngine(value as 'openai' | 'deeplx')}
                  >
                    <SelectTrigger className="bg-white text-sm">
                      <SelectValue placeholder="Select translation engine" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="deeplx">Deeplx</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {translationEngine === 'openai' ? (
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="openaiApiKey" className="text-xs font-medium mb-1 block">OpenAI API Key</Label>
                      <Input
                        id="openaiApiKey"
                        type="password"
                        placeholder="Enter your OpenAI API key"
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        className="bg-white text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="openaiBaseUrl" className="text-xs font-medium mb-1 block">OpenAI Base URL (Optional)</Label>
                      <Input
                        id="openaiBaseUrl"
                        placeholder="https://api.openai.com/v1"
                        value={openaiBaseUrl}
                        onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                        className="bg-white text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">For custom endpoints or OpenAI proxies</p>
                    </div>
                    <div>
                      <Label htmlFor="openaiModel" className="text-xs font-medium mb-1 block">OpenAI Model (Optional)</Label>
                      <Input
                        id="openaiModel"
                        placeholder="gpt-4o"
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        className="bg-white text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">For custom models or versions</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="deeplxApiKey" className="text-xs font-medium mb-1 block">DeepL X API Key</Label>
                    <Input
                      id="deeplxApiKey"
                      type="password"
                      placeholder="Enter your DeepL X API key"
                      value={deeplxApiKey}
                      onChange={(e) => setDeeplxApiKey(e.target.value)}
                      className="bg-white text-sm"
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="targetLanguage" className="text-xs font-medium mb-1 block">Target Language</Label>
                  <Select
                    value={targetLanguage}
                    onValueChange={setTargetLanguage}
                  >
                    <SelectTrigger className="bg-white text-sm">
                      <SelectValue placeholder="Select target language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EN">English</SelectItem>
                      <SelectItem value="ZH">Chinese (Simplified)</SelectItem>
                      <SelectItem value="JA">Japanese</SelectItem>
                      <SelectItem value="KO">Korean</SelectItem>
                      <SelectItem value="FR">French</SelectItem>
                      <SelectItem value="DE">German</SelectItem>
                      <SelectItem value="ES">Spanish</SelectItem>
                      <SelectItem value="RU">Russian</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Tabs defaultValue="url" className="w-full">
              <TabsList className="grid grid-cols-3 mb-4 bg-gray-100">
                <TabsTrigger
                  value="url"
                  className="flex items-center gap-1 data-[state=active]:bg-[#4285F4] data-[state=active]:text-white"
                >
                  <Globe size={14} /> PDF URL
                </TabsTrigger>
                <TabsTrigger
                  value="file"
                  className="flex items-center gap-1 data-[state=active]:bg-[#4285F4] data-[state=active]:text-white"
                >
                  <FileUp size={14} /> Upload PDF
                </TabsTrigger>
                <TabsTrigger
                  value="image"
                  className="flex items-center gap-1 data-[state=active]:bg-[#4285F4] data-[state=active]:text-white"
                >
                  <Image size={14} /> Image
                </TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-3">
                <div>
                  <Label htmlFor="pdfUrl" className="text-sm font-medium mb-1 block">PDF URL</Label>
                  <Input
                    id="pdfUrl"
                    placeholder="https://example.com/document.pdf"
                    value={pdfUrl}
                    onChange={(e) => setPdfUrl(e.target.value)}
                    className="bg-gray-50 text-sm"
                  />
                </div>
                <motion.div
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => handleProcessDocument('url')}
                    disabled={loading || !apiKey || !pdfUrl}
                    className="w-full bg-[#4285F4] hover:bg-[#3367D6] text-white"
                  >
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                      <>Process PDF URL</>
                    )}
                  </Button>
                </motion.div>
              </TabsContent>

              <TabsContent value="file" className="space-y-3">
                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="file" className="text-sm font-medium mb-1 block">Upload PDF</Label>
                  {!file ? (
                    <div className="flex items-center justify-center w-full">
                      <label htmlFor="file" className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 border-gray-300 hover:bg-gray-100">
                        <div className="flex flex-col items-center justify-center pt-4 pb-4">
                          <FileUp className="w-7 h-7 mb-2 text-[#4285F4]" />
                          <p className="mb-1 text-sm text-gray-600">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">PDF files only</p>
                        </div>
                        <Input
                          id="file"
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-200 min-w-0">
                      <FileUp className="h-8 w-8 text-[#4285F4] mr-3 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate max-w-full" title={file.name}>{file.name}</p>
                        <p className="text-xs text-gray-500 truncate">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFile}
                        className="text-gray-500 hover:text-gray-700 flex-shrink-0 ml-2"
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">The file will be processed directly without being stored on our servers</p>
                </div>
                <motion.div
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => handleProcessDocument('file')}
                    disabled={loading || !apiKey || !file}
                    className="w-full bg-[#4285F4] hover:bg-[#3367D6] text-white"
                  >
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                      <>Process PDF</>
                    )}
                  </Button>
                </motion.div>
              </TabsContent>

              <TabsContent value="image" className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  {!imageFile ? (
                    <div>
                      <Label htmlFor="imageFile" className="text-sm font-medium mb-1 block">Upload Image</Label>
                      <div className="flex items-center justify-center w-full">
                        <label htmlFor="imageFile" className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 border-gray-300 hover:bg-gray-100">
                          <div className="flex flex-col items-center justify-center pt-4 pb-4">
                            <Image className="w-7 h-7 mb-2 text-[#4285F4]" />
                            <p className="mb-1 text-sm text-gray-600">
                              <span className="font-semibold">Click to upload</span> or drag and drop
                            </p>
                            <p className="text-xs text-gray-500">JPG, PNG, WEBP, etc.</p>
                          </div>
                          <Input
                            id="imageFile"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageFileChange}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-sm font-medium mb-1 block">Selected Image</Label>
                      <div className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-200 min-w-0">
                        <Image className="h-8 w-8 text-[#4285F4] mr-3" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{imageFile.name}</p>
                          <p className="text-xs text-gray-500 truncate">{(imageFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearImageFile}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )}

                  {imageFile && !imageUrl && (
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-xs text-amber-600 flex-1">
                        <Info size={14} className="inline mr-1" />
                        Image needs to be uploaded before processing
                      </p>
                      <Button
                        onClick={uploadImageToS3}
                        disabled={uploading || !imageFile}
                        variant="outline"
                        size="sm"
                        className="border-[#FBBC05] text-[#FBBC05] hover:bg-[#FBBC05]/10"
                      >
                        {uploading ? (
                          <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Uploading...</>
                        ) : (
                          <>Upload Image</>
                        )}
                      </Button>
                    </div>
                  )}

                  {imageUrl && (
                    <div>
                      <Label htmlFor="imageUrl" className="text-sm font-medium mb-1 block">Image URL</Label>
                      <Input
                        id="imageUrl"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        className="bg-gray-50 text-sm"
                        readOnly
                      />
                      <p className="text-xs text-green-600 mt-1 flex items-center">
                        <Info size={14} className="inline mr-1" />
                        Image uploaded successfully and ready for processing
                      </p>
                    </div>
                  )}

                  {!imageFile && !imageUrl && (
                    <div>
                      <Label htmlFor="imageUrl" className="text-sm font-medium mb-1 block">Image URL (Optional)</Label>
                      <Input
                        id="imageUrl"
                        placeholder="https://example.com/image.jpg"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        className="bg-gray-50 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        You can directly enter an image URL instead of uploading
                      </p>
                    </div>
                  )}
                </div>
                <motion.div
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => handleProcessDocument('image')}
                    disabled={loading || !apiKey || (!imageUrl && !imageFile)}
                    className="w-full bg-[#4285F4] hover:bg-[#3367D6] text-white"
                  >
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                      <>Process Image</>
                    )}
                  </Button>
                </motion.div>
              </TabsContent>
            </Tabs>
          </CardContent>

          {result && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.5 }}
            >
              <CardFooter className="flex flex-col p-4 border-t">
                <div className="w-full flex justify-between items-center mb-3">
                  <h3 className="text-base font-medium">Results ({result.pages.length} pages)</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResult(null)}
                      className="flex items-center gap-1 border-[#FF5252] text-[#FF5252] hover:bg-[#FF5252]/10"
                    >
                      Clear Results
                    </Button>
                    {!translatedResult && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={translateMarkdown}
                        disabled={translating || !result || (translationEngine === 'openai' && !openaiApiKey) || (translationEngine === 'deeplx' && !deeplxApiKey)}
                        className="flex items-center gap-1 border-[#FBBC05] text-[#FBBC05] hover:bg-[#FBBC05]/10"
                      >
                        {translating ? (
                          <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Translating...</>
                        ) : (
                          <><Languages size={14} /> Translate</>
                        )}
                      </Button>
                    )}

                    {translatedResult ? (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadMarkdownWithImages(false)}
                          className="flex items-center gap-1 border-[#34A853] text-[#34A853] hover:bg-[#34A853]/10"
                          disabled={loading}
                        >
                          {loading ? (<Loader2 className="mr-1 h-3 w-3 animate-spin" />) : (<Download size={14} />)} Original
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadMarkdownWithImages(true)}
                          className="flex items-center gap-1 border-[#4285F4] text-[#4285F4] hover:bg-[#4285F4]/10"
                          disabled={loading}
                        >
                          {loading ? (<Loader2 className="mr-1 h-3 w-3 animate-spin" />) : (<Download size={14} />)} Translated
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadMarkdownWithImages(false)}
                        className="flex items-center gap-1 border-[#34A853] text-[#34A853] hover:bg-[#34A853]/10"
                        disabled={loading}
                      >
                        {loading ? (<Loader2 className="mr-1 h-3 w-3 animate-spin" />) : (<Download size={14} />)} Download Zip
                      </Button>
                    )}
                  </div>
                </div>

                <div className="w-full bg-gray-50 rounded-lg p-3 max-h-80 overflow-y-auto">
                  {result.pages.length > 0 ? (
                    <div className="space-y-3">
                      {result.pages
                        .sort((a, b) => a.index - b.index)
                        .map((page) => (
                          <div key={page.index} className="bg-white p-3 rounded shadow-sm border border-gray-100">
                            <h4 className="font-medium mb-1 text-sm flex justify-between">
                              <span>Page {page.index}</span>
                              <span className="text-xs text-gray-500">
                                {page.markdown.length} characters
                              </span>
                            </h4>
                            <div className="prose prose-sm max-w-none">
                              <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-gray-50 p-2 rounded">
                                {page.markdown.substring(0, 250)}
                                {page.markdown.length > 250 ? (
                                  <span className="text-[#4285F4]"> ... (click to expand)</span>
                                ) : ''}
                              </pre>
                            </div>
                          </div>
                        ))}

                      {translatedResult && translatedResult.pages && translatedResult.pages.length > 0 && (
                        <div className="space-y-3 mt-5 border-t pt-5 border-gray-200">
                          <h3 className="text-sm font-medium text-gray-700">Translation Results</h3>
                          {translatedResult.pages
                            .sort((a, b) => a.index - b.index)
                            .map((page) => (
                              <div key={page.index} className="bg-white p-3 rounded shadow-sm border border-gray-100">
                                <h4 className="font-medium mb-1 text-sm flex justify-between">
                                  <span>Page {page.index} (Translated)</span>
                                  <span className="text-xs text-gray-500">
                                    {page.markdown.length} characters
                                  </span>
                                </h4>
                                <div className="prose prose-sm max-w-none">
                                  <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-gray-50 p-2 rounded">
                                    {page.markdown.substring(0, 250)}
                                    {page.markdown.length > 250 ? (
                                      <span className="text-[#4285F4]"> ... (click to expand)</span>
                                    ) : ''}
                                  </pre>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-gray-600 mb-2">No content detected in the document.</p>
                      <p className="text-xs text-gray-500">Try processing a different document or image.</p>
                    </div>
                  )}
                </div>

                <div className="w-full mt-3">
                  <p className="text-xs text-gray-500 text-center">
                    Processed with Mistral AI OCR technology • {new Date().toLocaleDateString()}
                  </p>
                </div>
              </CardFooter>
            </motion.div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}