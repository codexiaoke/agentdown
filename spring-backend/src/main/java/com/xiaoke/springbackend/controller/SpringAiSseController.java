package com.xiaoke.springbackend.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiaoke.springbackend.model.ChatStreamRequest;
import com.xiaoke.springbackend.service.SpringAiChatService;
import com.xiaoke.springbackend.service.SpringAiConversationEventStore;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Spring AI 的后端权威会话、归档和可恢复 SSE 控制器。 */
@RestController
@CrossOrigin(exposedHeaders = {
        "X-Agentdown-Conversation-Id",
        "X-Agentdown-Request-Id",
        "X-Agentdown-Request-Reused"
})
public class SpringAiSseController {

    private static final Logger log = LoggerFactory.getLogger(SpringAiSseController.class);

    private final SpringAiChatService chatService;
    private final SpringAiConversationEventStore eventStore;
    private final ObjectMapper objectMapper;

    public SpringAiSseController(
            SpringAiChatService chatService,
            SpringAiConversationEventStore eventStore,
            ObjectMapper objectMapper
    ) {
        this.chatService = chatService;
        this.eventStore = eventStore;
        this.objectMapper = objectMapper;
    }

    /**
     * 首次请求启动后台生产；相同幂等键的后续请求只订阅已有运行并按游标补发。
     */
    @PostMapping(
            path = "/api/stream/springai",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public Flux<ServerSentEvent<String>> stream(
            @Valid @RequestBody ChatStreamRequest request,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestHeader(name = "Last-Event-ID", required = false) String lastEventId
    ) {
        String conversationId = StringUtils.hasText(request.sessionId())
                ? request.sessionId().trim()
                : "session:" + UUID.randomUUID();
        String requestId = StringUtils.hasText(idempotencyKey)
                ? idempotencyKey.trim()
                : StringUtils.hasText(request.clientRequestId())
                ? request.clientRequestId().trim()
                : "request:" + UUID.randomUUID();
        long afterCursor = resolveAfterCursor(lastEventId, request.afterCursor());
        ChatStreamRequest normalized = request.withRecoveryIdentity(conversationId, requestId);
        String fingerprint = serialize(normalized);

        SpringAiConversationEventStore.OpenRunResult opened;
        try {
            opened = eventStore.openRun(conversationId, requestId, fingerprint);
        } catch (SpringAiConversationEventStore.IdempotencyConflictException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage(), error);
        }

        if (!opened.reused()) {
            Schedulers.boundedElastic().schedule(() -> produce(opened, normalized));
        }

        return eventStore.subscribe(opened, afterCursor)
                .map(stored -> ServerSentEvent.<String>builder()
                        .id(stored.eventId())
                        .event(stored.event())
                        .data(serialize(stored.data()))
                        .build());
    }

    /** 返回刷新页面时使用的完整后端事件归档。 */
    @GetMapping("/api/v1/conversations/{conversationId}")
    public SpringAiConversationEventStore.ConversationArchive archive(
            @PathVariable String conversationId
    ) {
        SpringAiConversationEventStore.ConversationArchive archive = eventStore.load(conversationId);
        if (archive == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found: " + conversationId);
        }
        return archive;
    }

    private void produce(
            SpringAiConversationEventStore.OpenRunResult opened,
            ChatStreamRequest request
    ) {
        try {
            chatService.stream(
                    request,
                    payload -> eventStore.append(opened, resolveEventName(payload), payload)
            );
            eventStore.complete(opened, "completed");
        } catch (Throwable error) {
            log.error("Spring AI backend producer failed.", error);
            Map<String, Object> payload = createErrorPayload(error);
            eventStore.append(opened, "error", payload);
            eventStore.complete(opened, "failed");
        }
    }

    private long resolveAfterCursor(String lastEventId, Long bodyCursor) {
        if (!StringUtils.hasText(lastEventId)) {
            return bodyCursor == null ? 0L : requireNonNegative(bodyCursor);
        }
        String[] parts = lastEventId.trim().split(":");
        try {
            return requireNonNegative(Long.parseLong(parts[parts.length - 1]));
        } catch (NumberFormatException error) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "Last-Event-ID must end in a non-negative cursor.",
                    error
            );
        }
    }

    private long requireNonNegative(long cursor) {
        if (cursor < 0) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "Event cursor must be non-negative."
            );
        }
        return cursor;
    }

    private String resolveEventName(Map<String, Object> payload) {
        Object event = payload.get("event");
        return event instanceof String value && !value.isBlank() ? value : "message";
    }

    private String serialize(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize SSE payload.", exception);
        }
    }

    private Map<String, Object> createErrorPayload(Throwable error) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("message", StringUtils.hasText(error.getMessage())
                ? error.getMessage()
                : error.getClass().getSimpleName());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event", "error");
        payload.put("data", data);
        return payload;
    }
}
