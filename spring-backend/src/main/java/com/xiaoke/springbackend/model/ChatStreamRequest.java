package com.xiaoke.springbackend.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;

/**
 * 前端请求 Spring AI SSE 接口时使用的请求体。
 *
 * 这里约定：
 * - 首轮请求提交 `message`
 * - HITL 恢复请求提交 `session_id + springai_resume`
 *
 * `langchain_resume` 这里保留为兼容别名，方便你在前端适配器切换完成前继续本地联调。
 *
 * @param message        当前用户输入的问题；恢复 HITL 时可以为空。
 * @param sessionId      前端已持有的 sessionId；为空时后端会自动创建。
 * @param mode           可选的运行模式标记，例如 `hitl`。
 * @param springAiResume 使用同一个 SSE 入口继续已暂停 interrupt 时提交的人工决策。
 */
public record ChatStreamRequest(
        String message,
        @JsonProperty("session_id")
        String sessionId,
        String mode,
        @Valid
        @JsonProperty("springai_resume")
        @JsonAlias("langchain_resume")
        SpringAiResumeRequest springAiResume
) {

    /**
     * 校验当前请求至少要包含一类有效输入：
     * - 正常发送消息时带 `message`
     * - 恢复暂停流程时带 `springai_resume`
     *
     * @return 当前请求体是否满足最小输入要求。
     */
    @AssertTrue(message = "message 不能为空，除非当前请求是在继续 springai_resume。")
    public boolean hasMessageOrResume() {
        return hasText(message) || springAiResume != null;
    }

    /**
     * 当请求用于继续一个已暂停 HITL 流程时，必须带上已有 sessionId。
     *
     * @return resume 场景下是否提供了可恢复的 sessionId。
     */
    @AssertTrue(message = "springai_resume 场景必须提供 session_id。")
    public boolean hasSessionIdWhenResuming() {
        return springAiResume == null || hasText(sessionId);
    }

    /**
     * 判断一个字符串是否包含有效文本。
     *
     * @param value 待判断的字符串。
     * @return 非空白字符串返回 true。
     */
    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
