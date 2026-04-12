package com.xiaoke.springbackend.service;

import org.springframework.ai.deepseek.api.DeepSeekApi;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 为每个 session 保存一份 Spring AI 对话消息历史。
 */
@Component
public class SpringAiConversationStore {

    private final ConcurrentMap<String, Conversation> conversations = new ConcurrentHashMap<>();

    /**
     * 读取或创建某个会话的消息历史。
     *
     * @param sessionId 当前会话 id。
     * @return 当前会话对应的消息容器。
     */
    public Conversation get(String sessionId) {
        return conversations.computeIfAbsent(sessionId, ignored -> new Conversation());
    }

    /**
     * 单个会话的消息历史容器。
     */
    public static final class Conversation {

        private final List<DeepSeekApi.ChatCompletionMessage> messages = new ArrayList<>();

        /**
         * 返回当前会话消息快照。
         *
         * @return 一份可安全读取的副本。
         */
        public synchronized List<DeepSeekApi.ChatCompletionMessage> snapshot() {
            return new ArrayList<>(messages);
        }

        /**
         * 追加一条消息。
         *
         * @param message 当前消息。
         */
        public synchronized void append(DeepSeekApi.ChatCompletionMessage message) {
            messages.add(message);
        }

        /**
         * 追加一批消息。
         *
         * @param batch 一批顺序消息。
         */
        public synchronized void appendAll(List<DeepSeekApi.ChatCompletionMessage> batch) {
            messages.addAll(batch);
        }

        /**
         * 判断当前会话是否还是空历史。
         *
         * @return 消息为空时返回 true。
         */
        public synchronized boolean isEmpty() {
            return messages.isEmpty();
        }
    }
}
