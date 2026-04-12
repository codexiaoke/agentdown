package com.xiaoke.springbackend.service;

import org.springframework.ai.deepseek.api.DeepSeekApi;
import reactor.core.publisher.Flux;

/**
 * 默认的 Spring AI DeepSeek client 实现，直接透传到底层 `DeepSeekApi`。
 */
public class DefaultSpringAiDeepSeekClient implements SpringAiDeepSeekClient {

    private final DeepSeekApi deepSeekApi;

    /**
     * 构造默认 client。
     *
     * @param deepSeekApi 底层 Spring AI DeepSeek API。
     */
    public DefaultSpringAiDeepSeekClient(DeepSeekApi deepSeekApi) {
        this.deepSeekApi = deepSeekApi;
    }

    @Override
    public Flux<DeepSeekApi.ChatCompletionChunk> chatCompletionStream(DeepSeekApi.ChatCompletionRequest request) {
        return deepSeekApi.chatCompletionStream(request);
    }
}
