package com.xiaoke.springbackend.config;

import com.xiaoke.springbackend.service.DefaultSpringAiDeepSeekClient;
import com.xiaoke.springbackend.service.SpringAiDeepSeekClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.client.DefaultResponseErrorHandler;
import org.springframework.web.client.RestClient;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.ai.deepseek.api.DeepSeekApi;

/**
 * Spring AI 低层 DeepSeek 客户端相关 Bean 配置。
 */
@Configuration
@EnableConfigurationProperties(DeepSeekProperties.class)
public class SpringAiConfiguration {

    /**
     * 创建一个可直接访问 DeepSeek 原生流式接口的低层 API 客户端。
     *
     * @param properties 当前 DeepSeek 配置。
     * @return 可直接调用 `chatCompletionStream()` 的 Spring AI API。
     */
    @Bean
    public DeepSeekApi deepSeekApi(DeepSeekProperties properties) {
        if (!StringUtils.hasText(properties.getApiKey())) {
            throw new IllegalStateException("DEEPSEEK_API_KEY 未配置，无法启动 Spring AI backend。");
        }

        return DeepSeekApi.builder()
                .baseUrl(properties.getBaseUrl())
                .apiKey(properties.getApiKey())
                .completionsPath(properties.getCompletionsPath())
                .restClientBuilder(RestClient.builder())
                .webClientBuilder(WebClient.builder())
                .responseErrorHandler(new DefaultResponseErrorHandler())
                .build();
    }

    /**
     * 包一层接口，方便测试里替换成 fake client。
     *
     * @param deepSeekApi 底层 DeepSeek API。
     * @return 默认的 Spring AI DeepSeek client 实现。
     */
    @Bean
    public SpringAiDeepSeekClient springAiDeepSeekClient(DeepSeekApi deepSeekApi) {
        return new DefaultSpringAiDeepSeekClient(deepSeekApi);
    }
}
