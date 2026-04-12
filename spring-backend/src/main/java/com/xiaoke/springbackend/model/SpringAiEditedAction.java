package com.xiaoke.springbackend.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;

import java.util.Map;

/**
 * `edit` 决策里携带的修改后工具调用。
 *
 * @param name 修改后的工具名称。
 * @param args 修改后的工具参数。
 */
public record SpringAiEditedAction(
        String name,
        @JsonProperty("args")
        Map<String, Object> args
) {

    /**
     * 校验编辑后的工具名称不能为空。
     *
     * @return `name` 非空白时返回 true。
     */
    @AssertTrue(message = "edited_action.name 不能为空。")
    public boolean hasName() {
        return name != null && !name.isBlank();
    }
}
