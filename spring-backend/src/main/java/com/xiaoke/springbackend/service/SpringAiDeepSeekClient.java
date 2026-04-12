package com.xiaoke.springbackend.service;

import org.springframework.ai.deepseek.api.DeepSeekApi;
import reactor.core.publisher.Flux;

/**
 * 对 Spring AI DeepSeek 低层流式接口做的一层最小抽象。
 */
public interface SpringAiDeepSeekClient {

    /**
     * 发起一次真正的 DeepSeek 流式聊天请求。
     *
     * @param request 当前完整 chat completion 请求。
     * @return DeepSeek 原生 chunk 流。
     */
    Flux<DeepSeekApi.ChatCompletionChunk> chatCompletionStream(DeepSeekApi.ChatCompletionRequest request);
}
