// app/api/translate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            engine,
            openaiApiKey,
            openaiBaseUrl,
            openaiModel,
            deeplxApiKey,
            content,
            targetLanguage = 'ZH'
        } = body;

        if (!content) {
            return NextResponse.json(
                { error: 'Content is required' },
                { status: 400 }
            );
        }

        // 将内容分割成页面
        const pages = content.split('\n\n---\n\n');
        let translatedPages: string[] = [];

        if (engine === 'openai') {
            if (!openaiApiKey) {
                return NextResponse.json(
                    { error: 'OpenAI API key is required' },
                    { status: 400 }
                );
            }

            // 使用OpenAI进行翻译
            const openai = new OpenAI({
                apiKey: openaiApiKey,
                baseURL: openaiBaseUrl || 'https://api.openai.com/v1',
            });

            // 为每个页面创建翻译任务
            const translationPromises = pages.map(async (page) => {
                const systemPrompt = `You are a translation engine, you can only translate text and cannot interpret it, and do not explain. 
        Translate the text to ${getLanguageName(targetLanguage)}, please do not explain any sentences, just translate or leave them as they are. 
        Retain all spaces and line breaks in the original text. 
        Please do not wrap the code in code blocks, I will handle it myself. 
        If the code has comments, you should translate the comments as well. 
        If the original text is already in ${getLanguageName(targetLanguage)}, please do not skip the translation and directly output the original text. 
        This is the content you need to translate: `;

                const completion = await openai.chat.completions.create({
                    model: openaiModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: page }
                    ],
                    temperature: 0.6,
                });

                return completion.choices[0]?.message?.content || 'Translation failed';
            });

            // 等待所有翻译完成
            translatedPages = await Promise.all(translationPromises);
        } else if (engine === 'deeplx') {
            if (!deeplxApiKey) {
                return NextResponse.json(
                    { error: 'Deeplx API key is required' },
                    { status: 400 }
                );
            }

            // 使用DeepL X进行翻译
            const translationPromises = pages.map(async (page) => {
                const response = await fetch(`https://api.deeplx.org/${deeplxApiKey}/translate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        text: page,
                        source_lang: 'auto',
                        target_lang: targetLanguage,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.text();
                    console.error('DeepL translation error:', errorData);
                    throw new Error(`DeepL translation failed: ${response.status}`);
                }

                const data = await response.json();
                return data.data || 'Translation failed';
            });

            // 等待所有翻译完成
            translatedPages = await Promise.all(translationPromises);
        } else {
            return NextResponse.json(
                { error: 'Invalid translation engine' },
                { status: 400 }
            );
        }

        return NextResponse.json({ translatedPages });
    } catch (error) {
        console.error('Translation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'An unknown error occurred' },
            { status: 500 }
        );
    }
}

// 辅助函数：获取语言名称
function getLanguageName(code: string): string {
    const languageMap: Record<string, string> = {
        'EN': 'English',
        'ZH': 'Chinese (Simplified)',
        'JA': 'Japanese',
        'KO': 'Korean',
        'FR': 'French',
        'DE': 'German',
        'ES': 'Spanish',
        'RU': 'Russian',
    };

    return languageMap[code] || 'English';
}
