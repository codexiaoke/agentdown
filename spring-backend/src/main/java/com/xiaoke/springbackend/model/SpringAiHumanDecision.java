package com.xiaoke.springbackend.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;

/**
 * 一条 Spring AI HITL 人工决策。
 *
 * @param type         当前决策类型，例如 `approve`、`edit`、`reject`。
 * @param message      附带给后续模型继续推理的人工说明。
 * @param editedAction `edit` 时提交的修改后工具调用。
 */
public record SpringAiHumanDecision(
        String type,
        String message,
        @Valid
        @JsonProperty("edited_action")
        SpringAiEditedAction editedAction
) {

    /**
     * 校验当前决策类型是否合法。
     *
     * @return 当 type 属于受支持决策时返回 true。
     */
    @AssertTrue(message = "decision.type 只支持 approve / edit / reject。")
    public boolean hasSupportedType() {
        return "approve".equals(type) || "edit".equals(type) || "reject".equals(type);
    }

    /**
     * `edit` 决策必须携带修改后的工具信息。
     *
     * @return `edit` 时要求 `edited_action` 非空。
     */
    @AssertTrue(message = "decision.type=edit 时必须提供 edited_action。")
    public boolean hasEditedActionWhenNeeded() {
        return !"edit".equals(type) || editedAction != null;
    }

    /**
     * `edit` 与 `reject` 都必须携带人工说明，方便后续恢复时回写给模型。
     *
     * @return 当需要说明时，`message` 非空白返回 true。
     */
    @AssertTrue(message = "decision.type=edit 或 reject 时必须提供 message。")
    public boolean hasMessageWhenReasonIsRequired() {
        if (!"edit".equals(type) && !"reject".equals(type)) {
            return true;
        }

        return message != null && !message.isBlank();
    }
}
