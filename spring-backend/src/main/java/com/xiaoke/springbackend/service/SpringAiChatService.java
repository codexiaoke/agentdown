package com.xiaoke.springbackend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiaoke.springbackend.config.DeepSeekProperties;
import com.xiaoke.springbackend.model.ChatStreamRequest;
import com.xiaoke.springbackend.model.SpringAiEditedAction;
import com.xiaoke.springbackend.model.SpringAiHumanDecision;
import com.xiaoke.springbackend.model.SpringAiResumeRequest;
import org.springframework.ai.deepseek.api.DeepSeekApi;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * 基于 Spring AI DeepSeek 原生流式接口实现的聊天服务。
 *
 * 这版不再依赖 LangChain4j 的 agent / streaming callback 抽象，
 * 而是直接消费 `DeepSeekApi.chatCompletionStream()` 的 chunk 流，
 * 这样我们可以自己控制：
 * - 文本 delta 什么时候 flush
 * - tool call 如何聚合
 * - HITL 何时暂停 / 如何恢复
 * - SSE 事件如何组织给前端
 */
@Service
public class SpringAiChatService {

    private static final int MAX_AGENT_STEPS = 8;
    private static final Duration MODEL_STREAM_TIMEOUT = Duration.ofSeconds(120);
    private static final long PARTIAL_TEXT_FLUSH_WINDOW_MILLIS = 40;
    private static final int PARTIAL_TEXT_MAX_BUFFERED_CHARS = 24;
    private static final Set<Character> PARTIAL_TEXT_BOUNDARY_CHARACTERS = new HashSet<>(
            List.of('\n', '\r', '.', ',', ';', ':', '!', '?', '，', '。', '；', '：', '！', '？')
    );
    private static final String FRAMEWORK_NAME = "springai";
    private static final String WEATHER_TOOL_NAME = "lookup_weather";
    private static final String SYSTEM_PROMPT = """
            你是 Agentdown 的 Spring AI DeepSeek 演示助手。
            - 默认使用中文回答，除非用户明确要求其他语言。
            - 当用户询问天气、温度、风速、湿度等实时信息时，必须优先调用天气工具。
            - 如果发生了工具调用，请在最终回答里简要说明你做了什么。
            - 不要编造天气数据。
            - 最终回答可以使用简洁 Markdown。
            """;
    private static final ScheduledExecutorService PARTIAL_TEXT_FLUSH_SCHEDULER =
            Executors.newSingleThreadScheduledExecutor(new PartialTextFlushThreadFactory());

    private final SpringAiDeepSeekClient deepSeekClient;
    private final WeatherTools weatherTools;
    private final SpringAiPausedRunStore pausedRunStore;
    private final SpringAiConversationStore conversationStore;
    private final ObjectMapper objectMapper;
    private final DeepSeekProperties deepSeekProperties;
    private final DeepSeekApi.FunctionTool weatherTool;

    /**
     * 构造 Spring AI 聊天服务。
     *
     * @param deepSeekClient   DeepSeek 原生流式 client。
     * @param weatherTools     真实天气工具执行器。
     * @param pausedRunStore   保存 HITL 暂停状态的仓库。
     * @param conversationStore 保存每个 session 的对话消息历史。
     * @param objectMapper     JSON 序列化器。
     * @param deepSeekProperties DeepSeek 基础配置。
     */
    public SpringAiChatService(
            SpringAiDeepSeekClient deepSeekClient,
            WeatherTools weatherTools,
            SpringAiPausedRunStore pausedRunStore,
            SpringAiConversationStore conversationStore,
            ObjectMapper objectMapper,
            DeepSeekProperties deepSeekProperties
    ) {
        this.deepSeekClient = deepSeekClient;
        this.weatherTools = weatherTools;
        this.pausedRunStore = pausedRunStore;
        this.conversationStore = conversationStore;
        this.objectMapper = objectMapper;
        this.deepSeekProperties = deepSeekProperties;
        this.weatherTool = createWeatherToolDefinition();
    }

    /**
     * 执行一轮聊天请求，并把 Spring AI 事件持续推给调用方。
     *
     * @param request 前端请求体。
     * @param emit    当前请求的事件输出回调。
     */
    public void stream(ChatStreamRequest request, Consumer<Map<String, Object>> emit) {
        String sessionId = resolveSessionId(request);
        SpringAiConversationStore.Conversation conversation = conversationStore.get(sessionId);

        emit.accept(createSessionEvent(
                StringUtils.hasText(request.sessionId()) ? "session.resumed" : "session.created",
                sessionId
        ));

        if (request.springAiResume() != null) {
            streamResumeTurn(request, sessionId, conversation, emit);
            return;
        }

        streamNewTurn(request, sessionId, conversation, emit);
    }

    /**
     * 处理一轮全新的用户输入。
     */
    private void streamNewTurn(
            ChatStreamRequest request,
            String sessionId,
            SpringAiConversationStore.Conversation conversation,
            Consumer<Map<String, Object>> emit
    ) {
        if (pausedRunStore.has(sessionId)) {
            throw new IllegalStateException("当前 session 仍有待确认的 HITL interrupt，请先继续或拒绝它。");
        }

        if (!StringUtils.hasText(request.message())) {
            throw new IllegalArgumentException("message 不能为空。");
        }

        ensureSystemMessage(conversation);
        String userText = request.message().trim();
        conversation.append(createUserMessage(userText));

        String runId = newRunId();
        String turnId = newTurnId(sessionId);

        emit.accept(createRunStartedEvent(runId, sessionId, turnId, request.mode()));
        completeAgentLoop(
                conversation,
                sessionId,
                runId,
                turnId,
                0,
                isHitlMode(request.mode()),
                emit
        );
    }

    /**
     * 继续一轮已暂停的 HITL interrupt。
     */
    private void streamResumeTurn(
            ChatStreamRequest request,
            String sessionId,
            SpringAiConversationStore.Conversation conversation,
            Consumer<Map<String, Object>> emit
    ) {
        SpringAiPausedRunStore.PausedRun pausedRun = pausedRunStore.load(sessionId);

        if (pausedRun == null) {
            throw new IllegalStateException("当前 session 没有可继续的 Spring AI HITL interrupt。");
        }

        String runId = newRunId();
        emit.accept(createRunStartedEvent(runId, sessionId, pausedRun.turnId(), request.mode()));
        emit.accept(createApprovalResolvedEvent(runId, sessionId, pausedRun.turnId(), pausedRun.assistantMessageId()));

        applyHumanDecisions(
                pausedRun,
                request.springAiResume(),
                conversation,
                runId,
                emit
        );
        pausedRunStore.delete(sessionId);

        completeAgentLoop(
                conversation,
                sessionId,
                runId,
                pausedRun.turnId(),
                pausedRun.nextAssistantStep(),
                isHitlMode(request.mode()),
                emit
        );
    }

    /**
     * 让模型在当前对话历史上持续推理，直到：
     * - 得到最终回答
     * - 进入一次新的 HITL 暂停
     */
    private void completeAgentLoop(
            SpringAiConversationStore.Conversation conversation,
            String sessionId,
            String runId,
            String turnId,
            int startStep,
            boolean hitlMode,
            Consumer<Map<String, Object>> emit
    ) {
        for (int step = startStep; step < MAX_AGENT_STEPS; step += 1) {
            String assistantMessageId = newAssistantMessageId(turnId, step);
            emit.accept(createResponseStartedEvent(runId, sessionId, turnId, assistantMessageId, step));

            StreamedAssistantStepResult stepResult = streamAssistantStep(
                    conversation.snapshot(),
                    runId,
                    sessionId,
                    turnId,
                    assistantMessageId,
                    emit
            );

            if (stepResult.toolCalls().isEmpty()) {
                conversation.append(createAssistantMessage(stepResult.assistantText(), List.of()));
                emit.accept(createResponseCompletedEvent(
                        runId,
                        sessionId,
                        turnId,
                        assistantMessageId,
                        "completed",
                        stepResult.assistantText()
                ));
                emit.accept(createRunCompletedEvent(runId, sessionId, turnId, "completed"));
                emit.accept(createDoneEvent(runId, sessionId, turnId));
                return;
            }

            if (hitlMode) {
                SpringAiPausedRunStore.PausedRun pausedRun = createPausedRun(
                        sessionId,
                        runId,
                        turnId,
                        assistantMessageId,
                        step + 1,
                        stepResult
                );
                pausedRunStore.save(sessionId, pausedRun);
                emit.accept(createApprovalRequiredEvent(pausedRun));
                emit.accept(createResponseCompletedEvent(
                        runId,
                        sessionId,
                        turnId,
                        assistantMessageId,
                        "paused",
                        stepResult.assistantText()
                ));
                emit.accept(createRunCompletedEvent(runId, sessionId, turnId, "paused"));
                emit.accept(createDoneEvent(runId, sessionId, turnId));
                return;
            }

            conversation.append(createAssistantMessage(stepResult.assistantText(), stepResult.toolCalls()));
            emit.accept(createResponseCompletedEvent(
                    runId,
                    sessionId,
                    turnId,
                    assistantMessageId,
                    "tool_calls",
                    stepResult.assistantText()
            ));
            executeToolBatch(stepResult.toolCalls(), conversation, runId, sessionId, turnId, assistantMessageId, emit);
        }

        throw new IllegalStateException("Spring AI chat exceeded the maximum tool iteration limit.");
    }

    /**
     * 发起一轮真正的 DeepSeek 原生流式请求，并把 chunk 组装成 assistant 文本与 tool calls。
     */
    private StreamedAssistantStepResult streamAssistantStep(
            List<DeepSeekApi.ChatCompletionMessage> messages,
            String runId,
            String sessionId,
            String turnId,
            String assistantMessageId,
            Consumer<Map<String, Object>> emit
    ) {
        StringBuilder assistantText = new StringBuilder();
        TreeMap<Integer, MutableToolCall> toolCalls = new TreeMap<>();
        AtomicBoolean emittedPartialText = new AtomicBoolean(false);
        PartialTextCoalescer textCoalescer = new PartialTextCoalescer(
                runId,
                sessionId,
                turnId,
                assistantMessageId,
                emit,
                emittedPartialText
        );

        try {
            deepSeekClient.chatCompletionStream(buildChatRequest(messages))
                    .doOnNext(chunk -> consumeChunk(chunk, assistantText, toolCalls, textCoalescer))
                    .blockLast(MODEL_STREAM_TIMEOUT);
        } finally {
            textCoalescer.flush();
        }

        return new StreamedAssistantStepResult(
                assistantText.toString(),
                toolCalls.values().stream().map(MutableToolCall::toResolvedToolCall).toList(),
                emittedPartialText.get()
        );
    }

    /**
     * 消费一个 DeepSeek chunk，把文本和 tool call 增量合并到当前 step 状态。
     */
    private void consumeChunk(
            DeepSeekApi.ChatCompletionChunk chunk,
            StringBuilder assistantText,
            TreeMap<Integer, MutableToolCall> toolCalls,
            PartialTextCoalescer textCoalescer
    ) {
        if (chunk == null || chunk.choices() == null) {
            return;
        }

        for (DeepSeekApi.ChatCompletionChunk.ChunkChoice choice : chunk.choices()) {
            if (choice == null || choice.delta() == null) {
                continue;
            }

            DeepSeekApi.ChatCompletionMessage delta = choice.delta();
            String content = delta.content();

            if (StringUtils.hasText(content)) {
                assistantText.append(content);
                textCoalescer.push(content);
            }

            if (delta.toolCalls() != null) {
                for (DeepSeekApi.ChatCompletionMessage.ToolCall toolCall : delta.toolCalls()) {
                    int index = toolCall.index() != null ? toolCall.index() : toolCalls.size();
                    MutableToolCall current = toolCalls.computeIfAbsent(index, ignored -> new MutableToolCall(index));
                    current.merge(toolCall);
                }
            }
        }
    }

    /**
     * 把人工决策真正应用到一批待恢复工具调用上。
     */
    private void applyHumanDecisions(
            SpringAiPausedRunStore.PausedRun pausedRun,
            SpringAiResumeRequest resume,
            SpringAiConversationStore.Conversation conversation,
            String runId,
            Consumer<Map<String, Object>> emit
    ) {
        List<SpringAiHumanDecision> decisions = resume.decisions();
        List<SpringAiPausedRunStore.PendingToolCall> pendingToolCalls = pausedRun.toolCalls();

        if (decisions == null || decisions.size() != pendingToolCalls.size()) {
            throw new IllegalStateException("resume decisions 数量与当前 pending tool calls 不一致。");
        }

        List<ResolvedToolCall> resolvedToolCalls = new ArrayList<>();
        List<DeepSeekApi.ChatCompletionMessage> followUpMessages = new ArrayList<>();

        for (int index = 0; index < pendingToolCalls.size(); index += 1) {
            SpringAiPausedRunStore.PendingToolCall pendingToolCall = pendingToolCalls.get(index);
            SpringAiHumanDecision decision = decisions.get(index);

            if ("edit".equals(decision.type())) {
                SpringAiEditedAction editedAction = decision.editedAction();
                ResolvedToolCall editedToolCall = new ResolvedToolCall(
                        pendingToolCall.toolCallId(),
                        editedAction.name(),
                        resolveEditedArguments(editedAction),
                        writeJson(resolveEditedArguments(editedAction))
                );
                resolvedToolCalls.add(editedToolCall);
                followUpMessages.add(executeToolCall(
                        editedToolCall,
                        runId,
                        pausedRun.sessionId(),
                        pausedRun.turnId(),
                        pausedRun.assistantMessageId(),
                        emit
                ));
                followUpMessages.add(createSystemMessage(createEditedDecisionNote(editedToolCall, decision.message())));
                continue;
            }

            resolvedToolCalls.add(new ResolvedToolCall(
                    pendingToolCall.toolCallId(),
                    pendingToolCall.toolName(),
                    pendingToolCall.toolArgs(),
                    writeJson(pendingToolCall.toolArgs())
            ));

            if ("approve".equals(decision.type())) {
                followUpMessages.add(executeToolCall(
                        resolvedToolCalls.getLast(),
                        runId,
                        pausedRun.sessionId(),
                        pausedRun.turnId(),
                        pausedRun.assistantMessageId(),
                        emit
                ));
                continue;
            }

            followUpMessages.add(createToolResultMessage(
                    pendingToolCall.toolCallId(),
                    createRejectedToolResultMessage(pendingToolCall.toolName(), decision.message())
            ));
            followUpMessages.add(createSystemMessage(createRejectedDecisionNote(pendingToolCall.toolName(), decision.message())));
        }

        conversation.append(createAssistantMessage(pausedRun.assistantText(), resolvedToolCalls));
        conversation.appendAll(followUpMessages);
    }

    /**
     * 执行一批工具调用，并把工具结果回写到当前会话历史里。
     */
    private void executeToolBatch(
            List<ResolvedToolCall> toolCalls,
            SpringAiConversationStore.Conversation conversation,
            String runId,
            String sessionId,
            String turnId,
            String assistantMessageId,
            Consumer<Map<String, Object>> emit
    ) {
        for (ResolvedToolCall toolCall : toolCalls) {
            conversation.append(executeToolCall(toolCall, runId, sessionId, turnId, assistantMessageId, emit));
        }
    }

    /**
     * 执行一条工具调用，并把结果转换成 DeepSeek 可继续消费的 tool message。
     */
    private DeepSeekApi.ChatCompletionMessage executeToolCall(
            ResolvedToolCall toolCall,
            String runId,
            String sessionId,
            String turnId,
            String assistantMessageId,
            Consumer<Map<String, Object>> emit
    ) {
        emit.accept(createToolStartedEvent(runId, sessionId, turnId, assistantMessageId, toolCall));

        if (!WEATHER_TOOL_NAME.equals(toolCall.toolName())) {
            String unsupportedMessage = "暂不支持的工具：" + toolCall.toolName();
            emit.accept(createToolErrorEvent(runId, sessionId, turnId, assistantMessageId, toolCall, unsupportedMessage));
            return createToolResultMessage(toolCall.toolCallId(), unsupportedMessage);
        }

        Object cityValue = toolCall.toolArgs().get("city");

        if (!(cityValue instanceof String city) || city.isBlank()) {
            String validationMessage = "lookup_weather 需要非空 city 参数。";
            emit.accept(createToolErrorEvent(runId, sessionId, turnId, assistantMessageId, toolCall, validationMessage));
            return createToolResultMessage(toolCall.toolCallId(), validationMessage);
        }

        try {
            Object result = weatherTools.lookupWeather(city);
            emit.accept(createToolCompletedEvent(runId, sessionId, turnId, assistantMessageId, toolCall, result));
            return createToolResultMessage(toolCall.toolCallId(), writeJson(result));
        } catch (RuntimeException error) {
            String errorMessage = resolveToolExecutionErrorMessage(toolCall.toolName(), city, error);
            emit.accept(createToolErrorEvent(runId, sessionId, turnId, assistantMessageId, toolCall, errorMessage));
            return createToolResultMessage(toolCall.toolCallId(), errorMessage);
        }
    }

    /**
     * 为工具执行异常生成更适合回给模型和前端的错误文案。
     */
    private String resolveToolExecutionErrorMessage(
            String toolName,
            String city,
            RuntimeException error
    ) {
        Throwable current = error;

        while (current != null) {
            String message = current.getMessage();

            if (message != null) {
                String normalized = message.toLowerCase();

                if (normalized.contains("timeout") || normalized.contains("timed out")) {
                    return "工具 `" + toolName + "` 查询 " + city + " 天气超时，请稍后重试。";
                }

                if (normalized.contains("ssl") || normalized.contains("handshake")) {
                    return "工具 `" + toolName + "` 连接天气服务失败，请稍后重试。";
                }
            }

            current = current.getCause();
        }

        if (StringUtils.hasText(error.getMessage())) {
            return "工具 `" + toolName + "` 执行失败：" + error.getMessage().trim();
        }

        return "工具 `" + toolName + "` 执行失败，请稍后重试。";
    }

    /**
     * 创建当前暂停运行快照。
     */
    private SpringAiPausedRunStore.PausedRun createPausedRun(
            String sessionId,
            String runId,
            String turnId,
            String assistantMessageId,
            int nextAssistantStep,
            StreamedAssistantStepResult stepResult
    ) {
        List<SpringAiPausedRunStore.PendingToolCall> pendingToolCalls = stepResult.toolCalls().stream()
                .map(toolCall -> new SpringAiPausedRunStore.PendingToolCall(
                        "requirement-" + UUID.randomUUID(),
                        toolCall.toolCallId(),
                        toolCall.toolName(),
                        toolCall.toolArgs()
                ))
                .toList();

        return new SpringAiPausedRunStore.PausedRun(
                sessionId,
                runId,
                turnId,
                assistantMessageId,
                nextAssistantStep,
                stepResult.assistantText(),
                pendingToolCalls
        );
    }

    /**
     * 构造真正发给 DeepSeek 的聊天请求。
     */
    private DeepSeekApi.ChatCompletionRequest buildChatRequest(List<DeepSeekApi.ChatCompletionMessage> messages) {
        return new DeepSeekApi.ChatCompletionRequest(
                messages,
                deepSeekProperties.getModel(),
                null,
                deepSeekProperties.getMaxTokens(),
                null,
                null,
                null,
                true,
                deepSeekProperties.getTemperature(),
                null,
                null,
                null,
                List.of(weatherTool),
                null
        );
    }

    /**
     * 保证每个 session 第一次使用时都带上系统提示。
     */
    private void ensureSystemMessage(SpringAiConversationStore.Conversation conversation) {
        if (!conversation.isEmpty()) {
            return;
        }

        conversation.append(createSystemMessage(SYSTEM_PROMPT));
    }

    private DeepSeekApi.ChatCompletionMessage createSystemMessage(String content) {
        return new DeepSeekApi.ChatCompletionMessage(content, DeepSeekApi.ChatCompletionMessage.Role.SYSTEM);
    }

    private DeepSeekApi.ChatCompletionMessage createUserMessage(String content) {
        return new DeepSeekApi.ChatCompletionMessage(content, DeepSeekApi.ChatCompletionMessage.Role.USER);
    }

    private DeepSeekApi.ChatCompletionMessage createAssistantMessage(
            String content,
            List<ResolvedToolCall> toolCalls
    ) {
        List<DeepSeekApi.ChatCompletionMessage.ToolCall> resolved = toolCalls.stream()
                .map(toolCall -> new DeepSeekApi.ChatCompletionMessage.ToolCall(
                        toolCall.toolCallId(),
                        "function",
                        new DeepSeekApi.ChatCompletionMessage.ChatCompletionFunction(
                                toolCall.toolName(),
                                toolCall.rawArguments()
                        )
                ))
                .toList();

        return new DeepSeekApi.ChatCompletionMessage(
                content == null ? "" : content,
                DeepSeekApi.ChatCompletionMessage.Role.ASSISTANT,
                null,
                null,
                resolved
        );
    }

    private DeepSeekApi.ChatCompletionMessage createToolResultMessage(String toolCallId, String content) {
        return new DeepSeekApi.ChatCompletionMessage(
                content,
                DeepSeekApi.ChatCompletionMessage.Role.TOOL,
                null,
                toolCallId,
                null
        );
    }

    private DeepSeekApi.FunctionTool createWeatherToolDefinition() {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", Map.of(
                "city",
                Map.of(
                        "type", "string",
                        "description", "城市名，例如北京、上海、杭州。"
                )
        ));
        schema.put("required", List.of("city"));
        schema.put("additionalProperties", false);

        return new DeepSeekApi.FunctionTool(
                new DeepSeekApi.FunctionTool.Function(
                        "查询一个城市的实时天气。参数只需要城市名，例如北京、上海、杭州。",
                        WEATHER_TOOL_NAME,
                        schema,
                        false
                )
        );
    }

    private String resolveSessionId(ChatStreamRequest request) {
        return StringUtils.hasText(request.sessionId())
                ? request.sessionId().trim()
                : "springai-session-" + UUID.randomUUID();
    }

    private boolean isHitlMode(String mode) {
        return StringUtils.hasText(mode) && "hitl".equalsIgnoreCase(mode.trim());
    }

    private String newRunId() {
        return "run-" + UUID.randomUUID();
    }

    private String newTurnId(String sessionId) {
        return "turn:" + sessionId + ":" + System.currentTimeMillis();
    }

    private String newAssistantMessageId(String turnId, int step) {
        return "message:assistant:" + turnId + ":" + step;
    }

    private Map<String, Object> createSessionEvent(String eventName, String sessionId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("session_id", sessionId);
        data.put("conversation_id", sessionId);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", eventName);
        event.put("metadata", createMetadata(sessionId, null, null, null));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createRunStartedEvent(
            String runId,
            String sessionId,
            String turnId,
            String mode
    ) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("mode", mode);
        data.put("group_id", turnId);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "run.started");
        event.put("metadata", createMetadata(sessionId, runId, turnId, null));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createRunCompletedEvent(
            String runId,
            String sessionId,
            String turnId,
            String status
    ) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", status);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "run.completed");
        event.put("metadata", createMetadata(sessionId, runId, turnId, null));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createDoneEvent(
            String runId,
            String sessionId,
            String turnId
    ) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "done");
        event.put("metadata", createMetadata(sessionId, runId, turnId, null));
        event.put("data", Map.of());
        return event;
    }

    private Map<String, Object> createResponseStartedEvent(
            String runId,
            String sessionId,
            String turnId,
            String messageId,
            int step
    ) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("role", "assistant");
        data.put("step", step);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "response.started");
        event.put("metadata", createMetadata(sessionId, runId, turnId, messageId));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createResponseDeltaEvent(
            String runId,
            String sessionId,
            String turnId,
            String messageId,
            String content
    ) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("content", content);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "response.delta");
        event.put("metadata", createMetadata(sessionId, runId, turnId, messageId));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createResponseCompletedEvent(
            String runId,
            String sessionId,
            String turnId,
            String messageId,
            String status,
            String content
    ) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", status);
        data.put("content", content);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "response.completed");
        event.put("metadata", createMetadata(sessionId, runId, turnId, messageId));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createToolStartedEvent(
            String runId,
            String sessionId,
            String turnId,
            String messageId,
            ResolvedToolCall toolCall
    ) {
        Map<String, Object> data = createToolData(toolCall);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "tool.started");
        event.put("metadata", createMetadata(sessionId, runId, turnId, messageId));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createToolCompletedEvent(
            String runId,
            String sessionId,
            String turnId,
            String messageId,
            ResolvedToolCall toolCall,
            Object result
    ) {
        Map<String, Object> data = createToolData(toolCall);
        data.put("result", result);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "tool.completed");
        event.put("metadata", createMetadata(sessionId, runId, turnId, messageId));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createToolErrorEvent(
            String runId,
            String sessionId,
            String turnId,
            String messageId,
            ResolvedToolCall toolCall,
            String errorMessage
    ) {
        Map<String, Object> data = createToolData(toolCall);
        data.put("message", errorMessage);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "tool.error");
        event.put("metadata", createMetadata(sessionId, runId, turnId, messageId));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createApprovalRequiredEvent(SpringAiPausedRunStore.PausedRun pausedRun) {
        List<Map<String, Object>> actionRequests = pausedRun.toolCalls().stream()
                .map(toolCall -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("requirement_id", toolCall.requirementId());
                    item.put("tool_call_id", toolCall.toolCallId());
                    item.put("name", toolCall.toolName());
                    item.put("args", toolCall.toolArgs());
                    item.put("allowed_decisions", List.of("approve", "edit", "reject"));
                    return item;
                })
                .toList();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("interrupt_id", pausedRun.runId());
        data.put("assistant_text", pausedRun.assistantText());
        data.put("action_requests", actionRequests);
        data.put("reason_required_decisions", List.of("edit", "reject"));

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "approval.required");
        event.put("metadata", createMetadata(
                pausedRun.sessionId(),
                pausedRun.runId(),
                pausedRun.turnId(),
                pausedRun.assistantMessageId()
        ));
        event.put("data", data);
        return event;
    }

    private Map<String, Object> createApprovalResolvedEvent(
            String runId,
            String sessionId,
            String turnId,
            String messageId
    ) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("event", "approval.resolved");
        event.put("metadata", createMetadata(sessionId, runId, turnId, messageId));
        event.put("data", Map.of());
        return event;
    }

    private Map<String, Object> createToolData(ResolvedToolCall toolCall) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tool_call_id", toolCall.toolCallId());
        data.put("tool_name", toolCall.toolName());
        data.put("tool_args", toolCall.toolArgs());
        return data;
    }

    private Map<String, Object> createMetadata(
            String sessionId,
            String runId,
            String turnId,
            String messageId
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("framework", FRAMEWORK_NAME);
        metadata.put("session_id", sessionId);
        metadata.put("conversation_id", sessionId);
        metadata.put("timestamp", Instant.now().toString());

        if (runId != null) {
            metadata.put("run_id", runId);
        }

        if (turnId != null) {
            metadata.put("turn_id", turnId);
            metadata.put("group_id", turnId);
        }

        if (messageId != null) {
            metadata.put("message_id", messageId);
        }

        return metadata;
    }

    private String createRejectedToolResultMessage(String toolName, String reason) {
        String resolvedReason = StringUtils.hasText(reason)
                ? reason.trim()
                : "人工确认拒绝执行这次工具调用。";
        return "人工确认拒绝执行工具 `" + toolName + "`。原因：" + resolvedReason;
    }

    private String createEditedDecisionNote(ResolvedToolCall toolCall, String reviewerMessage) {
        StringBuilder note = new StringBuilder();
        note.append("系统审批说明：人工审核已经将工具 `")
                .append(toolCall.toolName())
                .append("` 修改为参数 ")
                .append(writeJson(toolCall.toolArgs()))
                .append("，并且修改后的工具调用已经执行完成。")
                .append("请直接基于这次已执行的结果继续回答，不要为了回到原始参数再次调用同一个工具。");

        if (StringUtils.hasText(reviewerMessage)) {
            note.append("补充说明：").append(reviewerMessage.trim());
        }

        return note.toString();
    }

    private String createRejectedDecisionNote(String toolName, String reviewerMessage) {
        StringBuilder note = new StringBuilder();
        note.append("系统审批说明：工具 `")
                .append(toolName)
                .append("` 在当前轮已经被人工拒绝。")
                .append("请不要在同一轮里再次调用这个工具，直接根据现有上下文继续回答。");

        if (StringUtils.hasText(reviewerMessage)) {
            note.append("拒绝原因：").append(reviewerMessage.trim());
        }

        return note.toString();
    }

    private Map<String, Object> resolveEditedArguments(SpringAiEditedAction editedAction) {
        if (editedAction == null || editedAction.args() == null) {
            return Map.of();
        }

        return editedAction.args();
    }

    private Map<String, Object> parseArgumentsObject(String rawArguments) {
        if (!StringUtils.hasText(rawArguments)) {
            return Map.of();
        }

        try {
            return objectMapper.readValue(rawArguments, new TypeReference<>() {});
        } catch (JsonProcessingException exception) {
            return Map.of("__rawArguments", rawArguments);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize JSON payload.", exception);
        }
    }

    /**
     * 一轮 assistant step 聚合完成后的结果。
     */
    private record StreamedAssistantStepResult(
            String assistantText,
            List<ResolvedToolCall> toolCalls,
            boolean emittedPartialText
    ) {
    }

    /**
     * 一条已完整解析好的工具调用。
     */
    private record ResolvedToolCall(
            String toolCallId,
            String toolName,
            Map<String, Object> toolArgs,
            String rawArguments
    ) {
    }

    /**
     * 聚合一个流式 tool call 过程中不断到来的 name / arguments / id 片段。
     */
    private final class MutableToolCall {

        private final int index;
        private final StringBuilder id = new StringBuilder();
        private final StringBuilder type = new StringBuilder();
        private final StringBuilder name = new StringBuilder();
        private final StringBuilder arguments = new StringBuilder();

        private MutableToolCall(int index) {
            this.index = index;
        }

        private void merge(DeepSeekApi.ChatCompletionMessage.ToolCall toolCall) {
            mergeIncrementalText(id, toolCall.id());
            mergeIncrementalText(type, toolCall.type());

            if (toolCall.function() != null) {
                mergeIncrementalText(name, toolCall.function().name());
                mergeIncrementalText(arguments, toolCall.function().arguments());
            }
        }

        private ResolvedToolCall toResolvedToolCall() {
            String resolvedId = id.length() == 0 ? "tool-call-" + index : id.toString();
            String resolvedName = name.length() == 0 ? WEATHER_TOOL_NAME : name.toString();
            String rawArguments = arguments.toString();
            Map<String, Object> toolArgs = parseArgumentsObject(rawArguments);

            return new ResolvedToolCall(resolvedId, resolvedName, toolArgs, rawArguments);
        }
    }

    /**
     * 把 provider 可能返回的“增量片段”或“累计片段”统一合并到同一个 builder。
     */
    private void mergeIncrementalText(StringBuilder builder, String fragment) {
        if (!StringUtils.hasText(fragment)) {
            return;
        }

        String current = builder.toString();

        if (current.isEmpty()) {
            builder.append(fragment);
            return;
        }

        if (fragment.equals(current)) {
            return;
        }

        if (fragment.startsWith(current)) {
            builder.setLength(0);
            builder.append(fragment);
            return;
        }

        builder.append(fragment);
    }

    /**
     * 把同一波 burst 里的极碎文本片段合并后再发给前端。
     */
    private final class PartialTextCoalescer {

        private final String runId;
        private final String sessionId;
        private final String turnId;
        private final String messageId;
        private final Consumer<Map<String, Object>> emit;
        private final AtomicBoolean emittedPartialText;
        private final StringBuilder buffer = new StringBuilder();
        private ScheduledFuture<?> flushFuture;

        private PartialTextCoalescer(
                String runId,
                String sessionId,
                String turnId,
                String messageId,
                Consumer<Map<String, Object>> emit,
                AtomicBoolean emittedPartialText
        ) {
            this.runId = runId;
            this.sessionId = sessionId;
            this.turnId = turnId;
            this.messageId = messageId;
            this.emit = emit;
            this.emittedPartialText = emittedPartialText;
        }

        private synchronized void push(String partialText) {
            boolean hadBufferedText = buffer.length() > 0;
            emittedPartialText.set(true);
            buffer.append(partialText);

            if (buffer.length() >= PARTIAL_TEXT_MAX_BUFFERED_CHARS) {
                flushLocked();
                return;
            }

            if (containsBoundary(partialText)) {
                if (hadBufferedText || !isBoundaryOnly(partialText)) {
                    flushLocked();
                    return;
                }
            }

            if (flushFuture != null) {
                return;
            }

            flushFuture = PARTIAL_TEXT_FLUSH_SCHEDULER.schedule(
                    this::flushFromScheduler,
                    PARTIAL_TEXT_FLUSH_WINDOW_MILLIS,
                    TimeUnit.MILLISECONDS
            );
        }

        private synchronized void flush() {
            flushLocked();
        }

        private void flushFromScheduler() {
            synchronized (this) {
                flushFuture = null;
                flushLocked();
            }
        }

        private void flushLocked() {
            if (flushFuture != null) {
                flushFuture.cancel(false);
                flushFuture = null;
            }

            if (buffer.length() == 0) {
                return;
            }

            String text = buffer.toString();
            buffer.setLength(0);
            emit.accept(createResponseDeltaEvent(runId, sessionId, turnId, messageId, text));
        }
    }

    private boolean containsBoundary(String text) {
        for (int index = 0; index < text.length(); index += 1) {
            if (PARTIAL_TEXT_BOUNDARY_CHARACTERS.contains(text.charAt(index))) {
                return true;
            }
        }

        return false;
    }

    private boolean isBoundaryOnly(String text) {
        if (!StringUtils.hasText(text)) {
            return false;
        }

        for (int index = 0; index < text.length(); index += 1) {
            if (!PARTIAL_TEXT_BOUNDARY_CHARACTERS.contains(text.charAt(index))) {
                return false;
            }
        }

        return true;
    }

    /**
     * 为 partial text flush 调度器创建守护线程。
     */
    private static final class PartialTextFlushThreadFactory implements ThreadFactory {

        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "springai-partial-text-flush");
            thread.setDaemon(true);
            return thread;
        }
    }
}
