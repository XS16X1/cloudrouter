// 流式响应处理模块 - 处理SSE流式响应和token统计

import { recordApiRequest } from './stats.js';

// 处理流式响应
export async function handleStreamResponse(response, apiKey, env, requestStartTime) {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    let accumulatedData = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let finalUsage = null;
    
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body.getReader();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // 解码数据块
            const chunk = decoder.decode(value, { stream: true });
            accumulatedData += chunk;
            
            // 解析当前积累的数据中的usage信息
            try {
              const lines = accumulatedData.split('\n');
              for (const line of lines) {
                if (line.startsWith('data:') && line !== 'data: [DONE]') {
                  try {
                    const dataContent = line.substring(5).trim();
                    if (dataContent) {
                      const parsed = JSON.parse(dataContent);
                      if (parsed.usage) {
                        // 更新最终usage信息
                        finalUsage = parsed.usage;
                        promptTokens = finalUsage.prompt_tokens || 0;
                        completionTokens = finalUsage.completion_tokens || 0;
                      }
                    }
                  } catch (parseError) {
                    // 忽略解析错误，继续处理
                  }
                }
              }
            } catch (parseError) {
              // 忽略解析错误
            }
            
            // 发送数据块给客户端
            controller.enqueue(value);
          }
          
          // 流结束时记录统计
          if (finalUsage) {
            console.log(`API密钥 ${apiKey.substring(0, 8)}... 流式响应真实token使用量 - Prompt: ${promptTokens}, Completion: ${completionTokens}`);
            await recordApiRequest(apiKey, env, promptTokens, completionTokens);
          } else {
            console.log(`API密钥 ${apiKey.substring(0, 8)}... 未获取到usage信息，使用默认值`);
            await recordApiRequest(apiKey, env, 0, 0);
          }
          
          controller.close();
        } catch (error) {
          console.error('流式响应处理错误:', error);
          controller.error(error);
        }
      }
    });
    
    return new Response(readable, {
      status: response.status,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control, Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Transfer-Encoding': 'chunked',
      }
    });
  } catch (error) {
    console.error('创建流式响应失败:', error);
    // 降级到直接转发
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control, Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Transfer-Encoding': 'chunked',
      }
    });
  }
}