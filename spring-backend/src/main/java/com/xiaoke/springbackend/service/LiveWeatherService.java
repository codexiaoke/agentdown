package com.xiaoke.springbackend.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiaoke.springbackend.model.LiveWeather;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 通过 Open-Meteo 查询真实天气数据。
 */
@Service
public class LiveWeatherService {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(15);
    private static final int MAX_HTTP_ATTEMPTS = 2;
    private static final String USER_AGENT = "agentdown-spring-backend/1.0";
    private static final Map<String, List<String>> CITY_ALIASES = Map.of(
            "北京", List.of("北京", "北京市", "Beijing"),
            "北京市", List.of("北京市", "北京", "Beijing"),
            "上海", List.of("上海", "上海市", "Shanghai"),
            "上海市", List.of("上海市", "上海", "Shanghai"),
            "广州", List.of("广州", "广州市", "Guangzhou"),
            "广州市", List.of("广州市", "广州", "Guangzhou"),
            "深圳", List.of("深圳", "深圳市", "Shenzhen"),
            "深圳市", List.of("深圳市", "深圳", "Shenzhen"),
            "杭州", List.of("杭州", "杭州市", "Hangzhou"),
            "杭州市", List.of("杭州市", "杭州", "Hangzhou")
    );

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    /**
     * 构造天气服务。
     *
     * @param objectMapper Spring 注入的 JSON 序列化器。
     */
    @Autowired
    public LiveWeatherService(ObjectMapper objectMapper) {
        this(
                objectMapper,
                HttpClient.newBuilder()
                        .connectTimeout(CONNECT_TIMEOUT)
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .version(HttpClient.Version.HTTP_1_1)
                        .build()
        );
    }

    /**
     * 为测试或定制场景注入自定义 HTTP 客户端。
     *
     * @param objectMapper JSON 序列化器。
     * @param httpClient   实际执行 HTTP 请求的客户端。
     */
    protected LiveWeatherService(ObjectMapper objectMapper, HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    /**
     * 查询某个城市的实时天气。
     *
     * @param city 城市名。
     * @return 归一化后的天气结果。
     */
    public LiveWeather lookupLiveWeather(String city) {
        if (!StringUtils.hasText(city)) {
            throw new IllegalArgumentException("city 不能为空。");
        }

        String normalizedCity = city.trim();
        GeocodingResult location = resolveLocation(normalizedCity);
        ForecastResponse forecast = lookupForecast(location.latitude(), location.longitude());

        if (forecast.current() == null) {
            throw new IllegalStateException("天气服务没有返回 current 数据。");
        }

        CurrentWeather current = forecast.current();

        return new LiveWeather(
                normalizedCity,
                location.name(),
                location.country(),
                location.admin1(),
                location.latitude(),
                location.longitude(),
                resolveWeatherLabel(current.weatherCode()),
                current.weatherCode(),
                current.temperature2m(),
                current.relativeHumidity2m(),
                current.windSpeed10m(),
                current.windDirection10m(),
                current.isDay() != null && current.isDay() == 1,
                current.time(),
                forecast.timezone(),
                "open-meteo"
        );
    }

    /**
     * 按候选别名逐个尝试解析城市，优先兼容中文城市名。
     *
     * Open-Meteo 的 geocoding 对中文直传并不稳定，所以这里会先尝试原始名称，
     * 再尝试去掉“市”后缀，以及常见城市的英文别名，减少模型二次重试带来的额外 tool event。
     *
     * @param city 用户输入的城市名。
     * @return 命中的地理位置。
     */
    private GeocodingResult resolveLocation(String city) {
        List<String> candidates = resolveCityCandidates(city);
        RuntimeException lastTransportError = null;

        for (String candidate : candidates) {
            GeocodingResult result;

            try {
                result = lookupCoordinatesOrNull(candidate);
            } catch (RuntimeException error) {
                lastTransportError = error;
                continue;
            }

            if (result != null) {
                return result;
            }
        }

        if (lastTransportError != null) {
            throw new IllegalStateException("天气服务暂时不可用，请稍后重试。", lastTransportError);
        }

        throw new IllegalStateException("没有找到城市 “" + city + "” 对应的地理位置。");
    }

    /**
     * 生成地理编码的候选城市名列表。
     *
     * @param city 用户输入的城市名。
     * @return 去重后的候选名列表。
     */
    private List<String> resolveCityCandidates(String city) {
        List<String> candidates = new ArrayList<>();
        appendCandidate(candidates, city);

        if (city.endsWith("市") && city.length() > 1) {
            appendCandidate(candidates, city.substring(0, city.length() - 1));
        } else {
            appendCandidate(candidates, city + "市");
        }

        List<String> aliases = CITY_ALIASES.get(city);

        if (aliases != null) {
            for (String alias : aliases) {
                appendCandidate(candidates, alias);
            }
        }

        return candidates;
    }

    /**
     * 向候选列表中追加一个去重后的城市名。
     *
     * @param candidates 候选列表。
     * @param candidate  候选城市名。
     */
    private void appendCandidate(List<String> candidates, String candidate) {
        if (!StringUtils.hasText(candidate)) {
            return;
        }

        String normalized = candidate.trim();

        if (!candidates.contains(normalized)) {
            candidates.add(normalized);
        }
    }

    /**
     * 先通过地理编码接口解析经纬度。
     *
     * @param city 城市名。
     * @return 命中的地理位置。
     */
    private GeocodingResult lookupCoordinatesOrNull(String city) {
        String uri = UriComponentsBuilder
                .fromHttpUrl("https://geocoding-api.open-meteo.com/v1/search")
                .queryParam("name", city)
                .queryParam("count", 1)
                .queryParam("language", "zh")
                .queryParam("format", "json")
                .toUriString();

        GeocodingResponse response = getJson(uri, GeocodingResponse.class);

        if (response == null || response.results() == null || response.results().isEmpty()) {
            return null;
        }

        return response.results().getFirst();
    }

    /**
     * 再通过天气接口查询实时天气。
     *
     * @param latitude  纬度。
     * @param longitude 经度。
     * @return 实时天气结果。
     */
    private ForecastResponse lookupForecast(double latitude, double longitude) {
        String uri = UriComponentsBuilder
                .fromHttpUrl("https://api.open-meteo.com/v1/forecast")
                .queryParam("latitude", latitude)
                .queryParam("longitude", longitude)
                .queryParam(
                        "current",
                        "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day"
                )
                .queryParam("timezone", "auto")
                .toUriString();

        ForecastResponse response = getJson(uri, ForecastResponse.class);

        if (response == null) {
            throw new IllegalStateException("天气服务没有返回有效响应。");
        }

        return response;
    }

    /**
     * 使用更稳定的 JDK HTTP 客户端请求 JSON，避免 Reactor Netty 在部分网络环境下的 SSL 握手超时。
     *
     * @param uri  目标地址。
     * @param type 返回值类型。
     * @return 解析后的 JSON 对象。
     * @param <T>  目标类型。
     */
    private <T> T getJson(String uri, Class<T> type) {
        RuntimeException lastError = null;

        for (int attempt = 1; attempt <= MAX_HTTP_ATTEMPTS; attempt += 1) {
            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create(uri))
                        .timeout(REQUEST_TIMEOUT)
                        .header("Accept", "application/json")
                        .header("User-Agent", USER_AGENT)
                        .GET()
                        .build();
                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() >= 400) {
                    throw new IllegalStateException("天气服务请求失败，HTTP " + response.statusCode() + "。");
                }

                return objectMapper.readValue(response.body(), type);
            } catch (HttpTimeoutException exception) {
                lastError = new IllegalStateException("天气服务请求超时。", exception);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("天气服务请求被中断。", exception);
            } catch (IOException exception) {
                lastError = new IllegalStateException("天气服务网络请求失败。", exception);
            }
        }

        if (lastError != null) {
            throw lastError;
        }

        throw new IllegalStateException("天气服务请求失败。");
    }

    /**
     * 把 Open-Meteo 的天气代码映射成中文描述。
     *
     * @param code 天气代码。
     * @return 中文天气标签。
     */
    private String resolveWeatherLabel(Integer code) {
        if (code == null) {
            return "未知天气";
        }

        return switch (code) {
            case 0 -> "晴";
            case 1 -> "大部晴朗";
            case 2 -> "局部多云";
            case 3 -> "阴天";
            case 45, 48 -> "雾";
            case 51, 53, 55 -> "毛毛雨";
            case 56, 57 -> "冻毛毛雨";
            case 61, 63, 65 -> "下雨";
            case 66, 67 -> "冻雨";
            case 71, 73, 75, 77 -> "下雪";
            case 80, 81, 82 -> "阵雨";
            case 85, 86 -> "阵雪";
            case 95 -> "雷暴";
            case 96, 99 -> "强雷暴";
            default -> "未知天气";
        };
    }

    /**
     * 地理编码接口返回体。
     *
     * @param results 结果列表。
     */
    private record GeocodingResponse(List<GeocodingResult> results) {
    }

    /**
     * 单个地理位置结果。
     *
     * @param name      城市名。
     * @param country   国家名。
     * @param admin1    一级行政区。
     * @param latitude  纬度。
     * @param longitude 经度。
     */
    private record GeocodingResult(
            String name,
            String country,
            String admin1,
            double latitude,
            double longitude
    ) {
    }

    /**
     * 天气接口返回体。
     *
     * @param timezone 时区。
     * @param current  当前天气。
     */
    private record ForecastResponse(
            String timezone,
            CurrentWeather current
    ) {
    }

    /**
     * 当前天气对象。
     *
     * @param temperature2m      当前温度。
     * @param relativeHumidity2m 当前湿度。
     * @param weatherCode        天气代码。
     * @param windSpeed10m       风速。
     * @param windDirection10m   风向角度。
     * @param isDay              是否白天。
     * @param time               观测时间。
     */
    private record CurrentWeather(
            @JsonProperty("temperature_2m")
            double temperature2m,
            @JsonProperty("relative_humidity_2m")
            Integer relativeHumidity2m,
            @JsonProperty("weather_code")
            Integer weatherCode,
            @JsonProperty("wind_speed_10m")
            Double windSpeed10m,
            @JsonProperty("wind_direction_10m")
            Integer windDirection10m,
            @JsonProperty("is_day")
            Integer isDay,
            String time
    ) {
    }
}
