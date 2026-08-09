package com.xiaoke.springbackend.service;

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
}
