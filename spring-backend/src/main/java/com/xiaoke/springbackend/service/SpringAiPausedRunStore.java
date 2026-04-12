package com.xiaoke.springbackend.service;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 保存 Spring AI HITL 暂停状态的内存仓库。
 */
@Component
public class SpringAiPausedRunStore {

    private final ConcurrentMap<String, PausedRun> pausedRuns = new ConcurrentHashMap<>();

    /**
     * 保存一个待恢复的暂停运行。
     *
     * @param sessionId 当前会话 id。
     * @param pausedRun 当前暂停内容。
     */
    public void save(String sessionId, PausedRun pausedRun) {
        pausedRuns.put(sessionId, pausedRun);
    }

    /**
     * 读取某个会话当前的暂停状态。
     *
     * @param sessionId 当前会话 id。
     * @return 当前暂停运行；没有时返回 null。
     */
    public PausedRun load(String sessionId) {
        return pausedRuns.get(sessionId);
    }

    /**
     * 删除某个会话的暂停状态。
     *
     * @param sessionId 当前会话 id。
     */
    public void delete(String sessionId) {
        pausedRuns.remove(sessionId);
    }

    /**
     * 判断某个会话是否存在未恢复的暂停状态。
     *
     * @param sessionId 当前会话 id。
     * @return 当前会话存在暂停运行时返回 true。
     */
    public boolean has(String sessionId) {
        return pausedRuns.containsKey(sessionId);
    }

    /**
     * 一条待恢复运行的完整快照。
     *
     * @param sessionId           当前会话 id。
     * @param runId               当前暂停所在的 run id。
     * @param turnId              当前 turn id。
     * @param assistantMessageId  当前 assistant 消息 id。
     * @param nextAssistantStep   恢复后下一次 assistant 响应应使用的 step 序号。
     * @param assistantText       暂停前 assistant 已经输出的文本。
     * @param toolCalls           当前待审批的工具调用列表。
     */
    public record PausedRun(
            String sessionId,
            String runId,
            String turnId,
            String assistantMessageId,
            int nextAssistantStep,
            String assistantText,
            List<PendingToolCall> toolCalls
    ) {
    }

    /**
     * 一条待审批工具调用。
     *
     * @param requirementId 当前审批项稳定 id。
     * @param toolCallId    当前 tool call id。
     * @param toolName      工具名称。
     * @param toolArgs      解析后的工具参数。
     */
    public record PendingToolCall(
            String requirementId,
            String toolCallId,
            String toolName,
            Map<String, Object> toolArgs
    ) {
    }
}
