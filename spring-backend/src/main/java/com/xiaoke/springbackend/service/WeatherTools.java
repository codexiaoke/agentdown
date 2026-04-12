package com.xiaoke.springbackend.service;

import com.xiaoke.springbackend.model.LiveWeather;
import org.springframework.stereotype.Component;

/**
 * Spring Backend 可复用的天气工具入口。
 *
 * 这里不再依赖任何特定 agent 框架注解，
 * 由上层 Spring AI 服务自行决定何时暴露这个工具给模型。
 */
@Component
public class WeatherTools {

    private final LiveWeatherService liveWeatherService;

    /**
     * 构造工具集合。
     *
     * @param liveWeatherService 真实天气查询服务。
     */
    public WeatherTools(LiveWeatherService liveWeatherService) {
        this.liveWeatherService = liveWeatherService;
    }

    /**
     * 查询一个城市的实时天气。
     *
     * @param city 城市名，例如北京、上海、杭州。
     * @return 结构化天气结果。
     */
    public LiveWeather lookupWeather(String city) {
        return liveWeatherService.lookupLiveWeather(city);
    }
}
