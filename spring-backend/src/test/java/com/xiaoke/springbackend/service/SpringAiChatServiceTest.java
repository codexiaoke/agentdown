package com.xiaoke.springbackend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiaoke.springbackend.config.DeepSeekProperties;
import com.xiaoke.springbackend.model.ChatStreamRequest;
import com.xiaoke.springbackend.model.LiveWeather;
import com.xiaoke.springbackend.model.SpringAiEditedAction;
import com.xiaoke.springbackend.model.SpringAiHumanDecision;
import com.xiaoke.springbackend.model.SpringAiResumeRequest;
import org.junit.jupiter.api.Test;
import org.springframework.ai.deepseek.api.DeepSeekApi;
import reactor.core.publisher.Flux;

import java.net.http.HttpClient;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 覆盖 Spring AI DeepSeek 聊天服务的核心主链路单测。
 */
class SpringAiChatServiceTest {

    /**
     * 非 HITL 模式下，应该能把流式 tool call 片段正确聚合，并继续完成最终回答。
     */
    @Test
    void streamsTextAndAggregatesToolCallFragments() {
        FakeSpringAiDeepSeekClient client = new FakeSpringAiDeepSeekClient(List.of(
                List.of(
                        textChunk("我来帮你查询"),
                        textChunk("北京天气。"),
                        toolChunk(0, "call-weather-1", "lookup_", "{\"ci"),
                        toolChunk(0, null, "weather", "ty\":\"北京\"}"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.TOOL_CALLS)
                ),
                List.of(
                        textChunk("根据查询结果，北京今天晴。"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.STOP)
                )
        ));
        SpringAiChatService service = createService(
                client,
                weatherToolsReturning(Map.of("北京", weather("北京")))
        );
        List<Map<String, Object>> events = new ArrayList<>();

        service.stream(new ChatStreamRequest("帮我查一下北京天气", null, null, null), events::add);

        List<String> eventNames = readEventNames(events);
        Map<String, Object> toolStarted = findEvent(events, "tool.started");
        Map<String, Object> toolCompleted = findEvent(events, "tool.completed");
        Map<String, Object> finalResponse = findLastEvent(events, "response.completed");

        assertEquals(
                List.of(
                        "session.created",
                        "run.started",
                        "response.started",
                        "response.delta",
                        "response.completed",
                        "tool.started",
                        "tool.completed",
                        "response.started",
                        "response.delta",
                        "response.completed",
                        "run.completed",
                        "done"
                ),
                eventNames
        );
        assertEquals(Map.of("city", "北京"), readMap(toolStarted.get("data")).get("tool_args"));
        assertEquals("lookup_weather", readMap(toolStarted.get("data")).get("tool_name"));
        assertEquals("北京", assertInstanceOf(LiveWeather.class, readMap(toolCompleted.get("data")).get("result")).city());
        assertEquals("completed", readMap(finalResponse.get("data")).get("status"));
        assertEquals(2, client.requests().size());
        assertEquals("lookup_weather", client.requests().getFirst().tools().getFirst().getFunction().getName());
        assertEquals(DeepSeekApi.ChatCompletionMessage.Role.TOOL, client.requests().get(1).messages().getLast().role());
    }

    /**
     * 开启 HITL 后，工具调用前必须先暂停，而不是直接执行工具。
     */
    @Test
    void pausesBeforeExecutingToolWhenHitlIsEnabled() {
        FakeSpringAiDeepSeekClient client = new FakeSpringAiDeepSeekClient(List.of(
                List.of(
                        textChunk("我来帮你查询天气。"),
                        toolChunk(0, "call-weather-1", "lookup_weather", "{\"city\":\"北京\"}"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.TOOL_CALLS)
                )
        ));
        SpringAiPausedRunStore pausedRunStore = new SpringAiPausedRunStore();
        SpringAiChatService service = createService(
                client,
                weatherToolsReturning(Map.of("北京", weather("北京"))),
                pausedRunStore
        );
        List<Map<String, Object>> events = new ArrayList<>();

        service.stream(new ChatStreamRequest("帮我查一下北京天气", null, "hitl", null), events::add);

        String sessionId = readString(readMap(events.getFirst().get("data")).get("session_id"));
        Map<String, Object> approvalRequired = findEvent(events, "approval.required");
        List<?> actionRequests = readList(readMap(approvalRequired.get("data")).get("action_requests"));
        Map<String, Object> firstActionRequest = readMap(actionRequests.getFirst());

        assertTrue(pausedRunStore.has(sessionId));
        assertFalse(readEventNames(events).contains("tool.started"));
        assertEquals("lookup_weather", firstActionRequest.get("name"));
        assertEquals(Map.of("city", "北京"), firstActionRequest.get("args"));
        assertEquals(List.of("edit", "reject"), readMap(approvalRequired.get("data")).get("reason_required_decisions"));
    }

    /**
     * `approve` 后应该执行工具，并继续完成第二次模型回答。
     */
    @Test
    void resumesApprovedInterruptAndExecutesTool() {
        FakeSpringAiDeepSeekClient client = new FakeSpringAiDeepSeekClient(List.of(
                List.of(
                        textChunk("我来帮你查询天气。"),
                        toolChunk(0, "call-weather-1", "lookup_weather", "{\"city\":\"北京\"}"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.TOOL_CALLS)
                ),
                List.of(
                        textChunk("根据查询结果，北京今天晴。"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.STOP)
                )
        ));
        SpringAiPausedRunStore pausedRunStore = new SpringAiPausedRunStore();
        SpringAiChatService service = createService(
                client,
                weatherToolsReturning(Map.of("北京", weather("北京"))),
                pausedRunStore
        );
        List<Map<String, Object>> firstRunEvents = new ArrayList<>();

        service.stream(new ChatStreamRequest("帮我查一下北京天气", null, "hitl", null), firstRunEvents::add);

        String sessionId = readString(readMap(firstRunEvents.getFirst().get("data")).get("session_id"));
        List<Map<String, Object>> resumeEvents = new ArrayList<>();

        service.stream(
                new ChatStreamRequest(
                        null,
                        sessionId,
                        "hitl",
                        new SpringAiResumeRequest(List.of(
                                new SpringAiHumanDecision("approve", null, null)
                        ))
                ),
                resumeEvents::add
        );

        Map<String, Object> toolStarted = findEvent(resumeEvents, "tool.started");
        Map<String, Object> toolCompleted = findEvent(resumeEvents, "tool.completed");
        Map<String, Object> runCompleted = findEvent(resumeEvents, "run.completed");

        assertEquals("session.resumed", readEventNames(resumeEvents).getFirst());
        assertEquals(Map.of("city", "北京"), readMap(toolStarted.get("data")).get("tool_args"));
        assertEquals("北京", assertInstanceOf(LiveWeather.class, readMap(toolCompleted.get("data")).get("result")).city());
        assertEquals("completed", readMap(runCompleted.get("data")).get("status"));
        assertFalse(pausedRunStore.has(sessionId));
        assertEquals(2, client.requests().size());
    }

    /**
     * `edit` 决策必须真正改掉工具参数，并把人工说明回写进后续上下文。
     */
    @Test
    void resumesWithEditedToolArguments() {
        FakeSpringAiDeepSeekClient client = new FakeSpringAiDeepSeekClient(List.of(
                List.of(
                        textChunk("我来帮你查询天气。"),
                        toolChunk(0, "call-weather-1", "lookup_weather", "{\"city\":\"北京\"}"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.TOOL_CALLS)
                ),
                List.of(
                        textChunk("根据查询结果，上海今天晴。"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.STOP)
                )
        ));
        SpringAiPausedRunStore pausedRunStore = new SpringAiPausedRunStore();
        SpringAiChatService service = createService(
                client,
                weatherToolsReturning(Map.of("上海", weather("上海"))),
                pausedRunStore
        );
        List<Map<String, Object>> firstRunEvents = new ArrayList<>();

        service.stream(new ChatStreamRequest("帮我查一下北京天气", null, "hitl", null), firstRunEvents::add);

        String sessionId = readString(readMap(firstRunEvents.getFirst().get("data")).get("session_id"));
        List<Map<String, Object>> resumeEvents = new ArrayList<>();

        service.stream(
                new ChatStreamRequest(
                        null,
                        sessionId,
                        "hitl",
                        new SpringAiResumeRequest(List.of(
                                new SpringAiHumanDecision(
                                        "edit",
                                        "请改查上海。",
                                        new SpringAiEditedAction("lookup_weather", Map.of("city", "上海"))
                                )
                        ))
                ),
                resumeEvents::add
        );

        Map<String, Object> toolStarted = findEvent(resumeEvents, "tool.started");
        DeepSeekApi.ChatCompletionRequest secondRequest = client.requests().get(1);
        DeepSeekApi.ChatCompletionMessage lastMessage = secondRequest.messages().getLast();

        assertEquals(Map.of("city", "上海"), readMap(toolStarted.get("data")).get("tool_args"));
        assertEquals(DeepSeekApi.ChatCompletionMessage.Role.SYSTEM, lastMessage.role());
        assertTrue(lastMessage.content().contains("修改后的工具调用已经执行完成"));
        assertTrue(lastMessage.content().contains("请改查上海"));
    }

    /**
     * `reject` 决策不应执行真实工具，而应该把拒绝结果回写给模型继续完成回答。
     */
    @Test
    void resumesWithRejectedToolAndSkipsExecution() {
        FakeSpringAiDeepSeekClient client = new FakeSpringAiDeepSeekClient(List.of(
                List.of(
                        textChunk("我来帮你查询天气。"),
                        toolChunk(0, "call-weather-1", "lookup_weather", "{\"city\":\"北京\"}"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.TOOL_CALLS)
                ),
                List.of(
                        textChunk("好的，这次我先不调用工具。"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.STOP)
                )
        ));
        SpringAiPausedRunStore pausedRunStore = new SpringAiPausedRunStore();
        SpringAiChatService service = createService(
                client,
                weatherToolsReturning(Map.of("北京", weather("北京"))),
                pausedRunStore
        );
        List<Map<String, Object>> firstRunEvents = new ArrayList<>();

        service.stream(new ChatStreamRequest("帮我查一下北京天气", null, "hitl", null), firstRunEvents::add);

        String sessionId = readString(readMap(firstRunEvents.getFirst().get("data")).get("session_id"));
        List<Map<String, Object>> resumeEvents = new ArrayList<>();

        service.stream(
                new ChatStreamRequest(
                        null,
                        sessionId,
                        "hitl",
                        new SpringAiResumeRequest(List.of(
                                new SpringAiHumanDecision("reject", "先不要查天气。", null)
                        ))
                ),
                resumeEvents::add
        );

        DeepSeekApi.ChatCompletionRequest secondRequest = client.requests().get(1);
        DeepSeekApi.ChatCompletionMessage toolMessage = secondRequest.messages().get(secondRequest.messages().size() - 2);
        DeepSeekApi.ChatCompletionMessage systemMessage = secondRequest.messages().getLast();

        assertFalse(readEventNames(resumeEvents).contains("tool.started"));
        assertEquals(DeepSeekApi.ChatCompletionMessage.Role.TOOL, toolMessage.role());
        assertTrue(toolMessage.content().contains("人工确认拒绝执行工具"));
        assertEquals(DeepSeekApi.ChatCompletionMessage.Role.SYSTEM, systemMessage.role());
        assertTrue(systemMessage.content().contains("已经被人工拒绝"));
        assertFalse(pausedRunStore.has(sessionId));
    }

    /**
     * 工具执行失败时，事件流不应直接崩掉，而应该继续把错误结果交给模型完成回答。
     */
    @Test
    void continuesAfterToolFailure() {
        FakeSpringAiDeepSeekClient client = new FakeSpringAiDeepSeekClient(List.of(
                List.of(
                        textChunk("我来帮你查询天气。"),
                        toolChunk(0, "call-weather-1", "lookup_weather", "{\"city\":\"北京\"}"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.TOOL_CALLS)
                ),
                List.of(
                        textChunk("天气服务暂时不可用，请稍后再试。"),
                        finishChunk(DeepSeekApi.ChatCompletionFinishReason.STOP)
                )
        ));
        SpringAiChatService service = createService(
                client,
                weatherToolsThrowing("北京", new IllegalStateException("timeout while connecting"))
        );
        List<Map<String, Object>> events = new ArrayList<>();

        service.stream(new ChatStreamRequest("帮我查一下北京天气", null, null, null), events::add);

        Map<String, Object> toolError = findEvent(events, "tool.error");
        Map<String, Object> runCompleted = findEvent(events, "run.completed");
        Map<String, Object> finalResponse = findLastEvent(events, "response.completed");

        assertTrue(readString(readMap(toolError.get("data")).get("message")).contains("超时"));
        assertEquals("completed", readMap(runCompleted.get("data")).get("status"));
        assertEquals("completed", readMap(finalResponse.get("data")).get("status"));
        assertEquals("done", readEventNames(events).getLast());
    }

    /**
     * 创建使用默认暂停仓库的待测服务。
     *
     * @param client       假的 DeepSeek 流式客户端。
     * @param weatherTools 假的天气工具。
     * @return 可直接执行的 Spring AI 聊天服务。
     */
    private SpringAiChatService createService(
            FakeSpringAiDeepSeekClient client,
            WeatherTools weatherTools
    ) {
        return createService(client, weatherTools, new SpringAiPausedRunStore());
    }

    /**
     * 创建完整依赖可控的待测服务。
     *
     * @param client         假的 DeepSeek 流式客户端。
     * @param weatherTools   假的天气工具。
     * @param pausedRunStore 暂停状态仓库。
     * @return 可直接执行的 Spring AI 聊天服务。
     */
    private SpringAiChatService createService(
            FakeSpringAiDeepSeekClient client,
            WeatherTools weatherTools,
            SpringAiPausedRunStore pausedRunStore
    ) {
        ObjectMapper objectMapper = new ObjectMapper();
        DeepSeekProperties properties = new DeepSeekProperties();
        properties.setModel("deepseek-chat");
        properties.setTemperature(0.3);
        properties.setMaxTokens(1024);

        return new SpringAiChatService(
                client,
                weatherTools,
                pausedRunStore,
                new SpringAiConversationStore(),
                objectMapper,
                properties
        );
    }

    /**
     * 创建一个按城市返回固定天气结果的假工具。
     *
     * @param results 城市到天气结果的映射。
     * @return 可直接注入服务的假工具。
     */
    private WeatherTools weatherToolsReturning(Map<String, LiveWeather> results) {
        return new WeatherTools(new FakeLiveWeatherService(new ObjectMapper(), results, null));
    }

    /**
     * 创建一个按城市抛出固定错误的假工具。
     *
     * @param city 目标城市。
     * @param error 固定异常。
     * @return 可直接注入服务的假工具。
     */
    private WeatherTools weatherToolsThrowing(String city, RuntimeException error) {
        return new WeatherTools(new FakeLiveWeatherService(new ObjectMapper(), Map.of(), Map.of(city, error)));
    }

    /**
     * 构造一个标准天气结果。
     *
     * @param city 城市名。
     * @return 假天气结果。
     */
    private LiveWeather weather(String city) {
        return new LiveWeather(
                city,
                city + "市",
                "中国",
                city,
                39.9,
                116.3,
                "晴",
                0,
                20.0,
                30,
                8.0,
                180,
                true,
                "2026-04-11T10:00",
                "Asia/Shanghai",
                "test"
        );
    }

    /**
     * 构造一个仅包含文本 delta 的 chunk。
     *
     * @param content 当前增量文本。
     * @return 一个文本 chunk。
     */
    private static DeepSeekApi.ChatCompletionChunk textChunk(String content) {
        return new DeepSeekApi.ChatCompletionChunk(
                "chunk-text",
                List.of(new DeepSeekApi.ChatCompletionChunk.ChunkChoice(
                        null,
                        0,
                        new DeepSeekApi.ChatCompletionMessage(
                                content,
                                DeepSeekApi.ChatCompletionMessage.Role.ASSISTANT
                        ),
                        null
                )),
                System.currentTimeMillis(),
                "deepseek-chat",
                null,
                null,
                "chat.completion.chunk",
                null
        );
    }

    /**
     * 构造一个包含工具调用增量的 chunk。
     *
     * @param index             工具调用序号。
     * @param toolCallId        本次增量携带的 tool call id。
     * @param functionNamePart  本次增量携带的函数名片段。
     * @param argumentsPart     本次增量携带的参数片段。
     * @return 一个工具调用 chunk。
     */
    private static DeepSeekApi.ChatCompletionChunk toolChunk(
            int index,
            String toolCallId,
            String functionNamePart,
            String argumentsPart
    ) {
        return new DeepSeekApi.ChatCompletionChunk(
                "chunk-tool",
                List.of(new DeepSeekApi.ChatCompletionChunk.ChunkChoice(
                        null,
                        index,
                        new DeepSeekApi.ChatCompletionMessage(
                                "",
                                DeepSeekApi.ChatCompletionMessage.Role.ASSISTANT,
                                null,
                                null,
                                List.of(new DeepSeekApi.ChatCompletionMessage.ToolCall(
                                        index,
                                        toolCallId,
                                        "function",
                                        new DeepSeekApi.ChatCompletionMessage.ChatCompletionFunction(
                                                functionNamePart,
                                                argumentsPart
                                        )
                                ))
                        ),
                        null
                )),
                System.currentTimeMillis(),
                "deepseek-chat",
                null,
                null,
                "chat.completion.chunk",
                null
        );
    }

    /**
     * 构造一个只带 finish reason 的结束 chunk。
     *
     * @param finishReason 当前 step 的结束原因。
     * @return 结束 chunk。
     */
    private static DeepSeekApi.ChatCompletionChunk finishChunk(DeepSeekApi.ChatCompletionFinishReason finishReason) {
        return new DeepSeekApi.ChatCompletionChunk(
                "chunk-finish",
                List.of(new DeepSeekApi.ChatCompletionChunk.ChunkChoice(
                        finishReason,
                        0,
                        new DeepSeekApi.ChatCompletionMessage(
                                "",
                                DeepSeekApi.ChatCompletionMessage.Role.ASSISTANT
                        ),
                        null
                )),
                System.currentTimeMillis(),
                "deepseek-chat",
                null,
                null,
                "chat.completion.chunk",
                null
        );
    }

    /**
     * 提取事件名列表。
     *
     * @param events 完整事件流。
     * @return 顺序事件名列表。
     */
    private List<String> readEventNames(List<Map<String, Object>> events) {
        return events.stream()
                .map(event -> readString(event.get("event")))
                .toList();
    }

    /**
     * 查找第一条匹配事件。
     *
     * @param events    事件流。
     * @param eventName 目标事件名。
     * @return 第一条匹配事件。
     */
    private Map<String, Object> findEvent(List<Map<String, Object>> events, String eventName) {
        return events.stream()
                .filter(event -> eventName.equals(event.get("event")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Missing event: " + eventName));
    }

    /**
     * 查找最后一条匹配事件。
     *
     * @param events    事件流。
     * @param eventName 目标事件名。
     * @return 最后一条匹配事件。
     */
    private Map<String, Object> findLastEvent(List<Map<String, Object>> events, String eventName) {
        Map<String, Object> matched = null;

        for (Map<String, Object> event : events) {
            if (eventName.equals(event.get("event"))) {
                matched = event;
            }
        }

        if (matched == null) {
            throw new AssertionError("Missing event: " + eventName);
        }

        return matched;
    }

    /**
     * 把对象安全断言成字符串。
     *
     * @param value 原始对象。
     * @return 字符串值。
     */
    private String readString(Object value) {
        return assertInstanceOf(String.class, value);
    }

    /**
     * 把对象安全断言成列表。
     *
     * @param value 原始对象。
     * @return 列表对象。
     */
    private List<?> readList(Object value) {
        return assertInstanceOf(List.class, value);
    }

    /**
     * 把对象安全断言成 Map。
     *
     * @param value 原始对象。
     * @return Map 对象。
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> readMap(Object value) {
        return assertInstanceOf(Map.class, value);
    }

    /**
     * 记录模型请求并按预设计划回放 chunk 的假 DeepSeek 客户端。
     */
    private static final class FakeSpringAiDeepSeekClient implements SpringAiDeepSeekClient {

        private final Deque<List<DeepSeekApi.ChatCompletionChunk>> plans;
        private final List<DeepSeekApi.ChatCompletionRequest> requests = new ArrayList<>();

        private FakeSpringAiDeepSeekClient(List<List<DeepSeekApi.ChatCompletionChunk>> plans) {
            this.plans = new ArrayDeque<>(plans);
        }

        @Override
        public Flux<DeepSeekApi.ChatCompletionChunk> chatCompletionStream(DeepSeekApi.ChatCompletionRequest request) {
            requests.add(request);
            List<DeepSeekApi.ChatCompletionChunk> plan = plans.pollFirst();

            if (plan == null) {
                return Flux.error(new IllegalStateException("Missing fake plan for request " + requests.size()));
            }

            return Flux.fromIterable(plan);
        }

        private List<DeepSeekApi.ChatCompletionRequest> requests() {
            return requests;
        }
    }

    /**
     * 可控返回天气结果或错误的假天气服务。
     */
    private static final class FakeLiveWeatherService extends LiveWeatherService {

        private final Map<String, LiveWeather> results;
        private final Map<String, RuntimeException> errors;

        private FakeLiveWeatherService(
                ObjectMapper objectMapper,
                Map<String, LiveWeather> results,
                Map<String, RuntimeException> errors
        ) {
            super(objectMapper, HttpClient.newHttpClient());
            this.results = new LinkedHashMap<>(results);
            this.errors = errors == null ? Map.of() : new LinkedHashMap<>(errors);
        }

        @Override
        public LiveWeather lookupLiveWeather(String city) {
            RuntimeException error = errors.get(city);

            if (error != null) {
                throw error;
            }

            LiveWeather result = results.get(city);
            assertNotNull(result, "Missing fake weather result for city: " + city);
            return result;
        }
    }
}
