package com.xiaoke.springbackend.service;

import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 保存 Spring AI 会话的原始事件日志，并协调幂等运行与断线续传。
 *
 * 这是示例后端的进程内实现；生产环境可以换成 PostgreSQL/Redis，HTTP 契约无需改变。
 */
@Component
public class SpringAiConversationEventStore {

    private final ConcurrentMap<String, ConversationState> conversations = new ConcurrentHashMap<>();

    /** 创建一轮新运行，或复用相同幂等键对应的已有运行。 */
    public OpenRunResult openRun(String conversationId, String requestId, String fingerprint) {
        ConversationState conversation = conversations.computeIfAbsent(
                conversationId,
                ConversationState::new
        );
        return conversation.openRun(requestId, fingerprint);
    }

    /** 追加一条不可变事件，并通知当前运行的所有订阅者。 */
    public StoredEvent append(OpenRunResult opened, String event, Map<String, Object> payload) {
        return opened.conversation().append(opened.run(), event, payload);
    }

    /** 标记生产任务结束，使当前和后续重连订阅都能正常结束。 */
    public void complete(OpenRunResult opened, String status) {
        opened.conversation().complete(opened.run(), status);
    }

    /** 从客户端已确认的游标之后订阅当前幂等运行。 */
    public Flux<StoredEvent> subscribe(OpenRunResult opened, long afterCursor) {
        return opened.run().sink.asFlux().filter(event -> event.cursor() > afterCursor);
    }

    /** 查询完整后端事件归档。 */
    public ConversationArchive load(String conversationId) {
        ConversationState conversation = conversations.get(conversationId);
        return conversation == null ? null : conversation.archive();
    }

    /** 一次 openRun 的结果。 */
    public record OpenRunResult(ConversationState conversation, RunState run, boolean reused) {
    }

    /** 对外返回的不可变事件。 */
    public record StoredEvent(
            long cursor,
            String eventId,
            String requestId,
            String event,
            Map<String, Object> data,
            String createdAt
    ) {
    }

    /** 对外返回的会话归档。 */
    public record ConversationArchive(
            String format,
            String conversationId,
            String providerId,
            long latestCursor,
            String status,
            String updatedAt,
            List<StoredEvent> events
    ) {
    }

    /** 单个幂等运行。 */
    public static final class RunState {
        private final String requestId;
        private final String fingerprint;
        private final Sinks.Many<StoredEvent> sink = Sinks.many().replay().all();
        private String status = "running";

        private RunState(String requestId, String fingerprint) {
            this.requestId = requestId;
            this.fingerprint = fingerprint;
        }
    }

    /** 单个会话的串行游标空间。 */
    public static final class ConversationState {
        private final String conversationId;
        private final List<StoredEvent> events = new ArrayList<>();
        private final Map<String, RunState> runs = new LinkedHashMap<>();
        private long latestCursor;
        private String updatedAt = Instant.now().toString();

        private ConversationState(String conversationId) {
            this.conversationId = conversationId;
        }

        private synchronized OpenRunResult openRun(String requestId, String fingerprint) {
            RunState existing = runs.get(requestId);
            if (existing != null) {
                if (!existing.fingerprint.equals(fingerprint)) {
                    throw new IdempotencyConflictException(
                            "Idempotency key " + requestId + " was already used with a different request."
                    );
                }
                return new OpenRunResult(this, existing, true);
            }

            RunState run = new RunState(requestId, fingerprint);
            runs.put(requestId, run);
            return new OpenRunResult(this, run, false);
        }

        private synchronized StoredEvent append(
                RunState run,
                String event,
                Map<String, Object> payload
        ) {
            latestCursor += 1;
            updatedAt = Instant.now().toString();
            StoredEvent stored = new StoredEvent(
                    latestCursor,
                    conversationId + ":" + latestCursor,
                    run.requestId,
                    event,
                    Map.copyOf(payload),
                    updatedAt
            );
            events.add(stored);
            run.sink.tryEmitNext(stored);
            return stored;
        }

        private synchronized void complete(RunState run, String status) {
            run.status = status;
            updatedAt = Instant.now().toString();
            run.sink.tryEmitComplete();
        }

        private synchronized ConversationArchive archive() {
            String status = runs.values().stream().anyMatch(run -> "running".equals(run.status))
                    ? "running"
                    : runs.values().stream().reduce((first, second) -> second).map(run -> run.status).orElse("empty");
            return new ConversationArchive(
                    "agentdown.conversation/v1",
                    conversationId,
                    "springai",
                    latestCursor,
                    status,
                    updatedAt,
                    List.copyOf(events)
            );
        }
    }

    /** 同一幂等键承载了不同请求。 */
    public static final class IdempotencyConflictException extends IllegalStateException {
        public IdempotencyConflictException(String message) {
            super(message);
        }
    }
}
