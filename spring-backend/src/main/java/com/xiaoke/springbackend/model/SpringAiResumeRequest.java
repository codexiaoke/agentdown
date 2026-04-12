package com.xiaoke.springbackend.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;

import java.util.List;

/**
 * 继续一个已暂停 Spring AI HITL interrupt 时使用的请求体。
 *
 * @param decisions 当前 interrupt batch 对应的人工决策列表。
 */
public record SpringAiResumeRequest(
        @Valid
        List<SpringAiHumanDecision> decisions
) {

    /**
     * 确保恢复请求里至少带有一条人工决策。
     *
     * @return `decisions` 非空时返回 true。
     */
    @AssertTrue(message = "springai_resume.decisions 不能为空。")
    public boolean hasDecisions() {
        return decisions != null && !decisions.isEmpty();
    }
}
