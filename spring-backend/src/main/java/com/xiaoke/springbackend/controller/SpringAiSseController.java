package com.xiaoke.springbackend.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiaoke.springbackend.model.ChatStreamRequest;
import com.xiaoke.springbackend.service.SpringAiChatService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;
import reactor.core.scheduler.Schedulers;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Spring AI SSE 控制器。
 *
 * 目前把 `/api/stream/springai` 作为正式入口，
 * 同时临时保留 `/api/stream/langchain` 兼容旧前端联调，
 * 但底层实现已经全部切到 Spring AI。
 */
@RestController
@RequestMapping("/api/stream")
@CrossOrigin
public class SpringAiSseController {

    private static final Logger log = LoggerFactory.getLogger(SpringAiSseController.class);

    private final SpringAiChatService springAiChatService;
    private final ObjectMapper objectMapper;

    /**
     * 构造 Spring AI SSE 控制器。
     *
     * @param springAiChatService 负责执行 DeepSeek 流式对话与 HITL 的服务。
     * @param objectMapper        Spring 注入的 JSON 序列化器。
     */
    public SpringAiSseController(
            SpringAiChatService springAiChatService,
            ObjectMapper objectMapper
    ) {
        this.springAiChatService = springAiChatService;
        this.objectMapper = objectMapper;
    }

    /**
     * 以 SSE 形式返回一轮 Spring AI 对话。
     *
     * 当前支持：
     * - 首轮 `message`
     * - `mode=hitl` 时的人工确认暂停
     * - `session_id + springai_resume` 恢复已暂停流程
     *
     * @param request 前端发来的请求体。
     * @return 持续输出 JSON 事件的 SSE Flux。
     */
    @PostMapping(
            path = {"/springai", "/langchain"},
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public Flux<ServerSentEvent<String>> stream(@Valid @RequestBody ChatStreamRequest request) {
        Sinks.Many<ServerSentEvent<String>> sink = Sinks.many().unicast().onBackpressureBuffer();

        Schedulers.boundedElastic().schedule(() -> {
            try {
                springAiChatService.stream(request, payload -> emit(sink, payload));
                sink.tryEmitComplete();
            } catch (Throwable error) {
                log.error("Spring AI SSE stream failed.", error);
                emit(sink, createErrorPayload(error));
                sink.tryEmitComplete();
            }
        });

        return sink.asFlux();
    }

    /**
     * 安全地向 SSE sink 推送一条 JSON 事件。
     *
     * @param sink    当前请求对应的 sink。
     * @param payload 一条完整事件。
     */
    private void emit(
            Sinks.Many<ServerSentEvent<String>> sink,
            Map<String, Object> payload
    ) {
        String event = resolveEventName(payload);
        String jsonPayload = serialize(payload);
        Sinks.EmitResult result = sink.tryEmitNext(
                ServerSentEvent.<String>builder()
                        .event(event)
                        .data(jsonPayload)
                        .build()
        );

        if (result.isFailure()) {
            log.debug("Skipping SSE event {} because sink emission failed: {}", event, result);
        }
    }

    /**
     * 解析当前 payload 对应的 SSE 事件名。
     *
     * @param payload 一条完整事件。
     * @return `payload.event`，缺失时回退成 `message`。
     */
    private String resolveEventName(Map<String, Object> payload) {
        Object event = payload.get("event");

        return event instanceof String value && !value.isBlank()
                ? value
                : "message";
    }

    /**
     * 把事件对象序列化成 JSON。
     *
     * @param payload 当前事件对象。
     * @return JSON 字符串。
     */
    private String serialize(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize SSE payload.", exception);
        }
    }

    /**
     * 把异常转换成前端易消费的 `error` 事件。
     *
     * @param error 当前异常。
     * @return 标准 error payload。
     */
    private Map<String, Object> createErrorPayload(Throwable error) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("message", resolveErrorMessage(error));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event", "error");
        payload.put("data", data);
        return payload;
    }

    /**
     * 生成更适合直接返回给前端的错误文案。
     *
     * @param error 原始异常。
     * @return 简洁错误提示。
     */
    private String resolveErrorMessage(Throwable error) {
        if (error.getMessage() != null && !error.getMessage().isBlank()) {
            return error.getMessage();
        }

        return error.getClass().getSimpleName();
    }
}
