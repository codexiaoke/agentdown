package com.xiaoke.springbackend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 覆盖后端事件归档、幂等复用和按游标补发。 */
class SpringAiConversationEventStoreTest {

    @Test
    void reusesRunAndReplaysOnlyEventsAfterCursor() {
        SpringAiConversationEventStore store = new SpringAiConversationEventStore();
        SpringAiConversationEventStore.OpenRunResult opened = store.openRun(
                "session:test",
                "request:1",
                "fingerprint"
        );
        store.append(opened, "response.delta", Map.of("content", "A"));
        store.append(opened, "response.delta", Map.of("content", "B"));
        store.complete(opened, "completed");

        SpringAiConversationEventStore.OpenRunResult reused = store.openRun(
                "session:test",
                "request:1",
                "fingerprint"
        );

        assertTrue(reused.reused());
        StepVerifier.create(store.subscribe(reused, 1L))
                .assertNext(event -> {
                    assertEquals(2L, event.cursor());
                    assertEquals("session:test:2", event.eventId());
                    assertEquals("B", event.data().get("content"));
                })
                .verifyComplete();
        assertEquals(2L, store.load("session:test").latestCursor());
        assertTrue(store.loadRun("session:test", "request:1").reused());
    }

    @Test
    void rejectsIdempotencyKeyReuseWithDifferentFingerprint() {
        SpringAiConversationEventStore store = new SpringAiConversationEventStore();
        store.openRun("session:test", "request:1", "first");

        assertThrows(
                SpringAiConversationEventStore.IdempotencyConflictException.class,
                () -> store.openRun("session:test", "request:1", "changed")
        );
    }

    @Test
    void serializesTheSameSnakeCaseArchiveContractAsFastApi() throws JsonProcessingException {
        SpringAiConversationEventStore store = new SpringAiConversationEventStore();
        SpringAiConversationEventStore.OpenRunResult opened = store.openRun(
                "session:test",
                "request:1",
                "fingerprint"
        );
        store.append(opened, "done", Map.of("event", "done"));
        store.complete(opened, "completed");

        String json = new ObjectMapper().writeValueAsString(store.load("session:test"));

        assertTrue(json.contains("\"conversation_id\":\"session:test\""));
        assertTrue(json.contains("\"provider_id\":\"springai\""));
        assertTrue(json.contains("\"latest_cursor\":1"));
        assertTrue(json.contains("\"active_request_id\""));
        assertTrue(json.contains("\"event_id\":\"session:test:1\""));
        assertTrue(json.contains("\"request_id\":\"request:1\""));
    }
}
