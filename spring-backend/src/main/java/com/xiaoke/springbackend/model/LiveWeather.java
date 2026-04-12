package com.xiaoke.springbackend.model;

/**
 * 查询后的天气结果。
 *
 * @param city             用户原始输入的城市名。
 * @param resolvedName     解析后的城市名称。
 * @param country          国家名。
 * @param admin1           一级行政区。
 * @param latitude         纬度。
 * @param longitude        经度。
 * @param condition        天气描述。
 * @param weatherCode      Open-Meteo 天气代码。
 * @param tempC            摄氏温度。
 * @param humidity         相对湿度。
 * @param windSpeedKmh     风速。
 * @param windDirectionDeg 风向角度。
 * @param isDay            是否白天。
 * @param observedAt       观测时间。
 * @param timezone         时区。
 * @param source           数据来源。
 */
public record LiveWeather(
        String city,
        String resolvedName,
        String country,
        String admin1,
        double latitude,
        double longitude,
        String condition,
        int weatherCode,
        double tempC,
        Integer humidity,
        Double windSpeedKmh,
        Integer windDirectionDeg,
        boolean isDay,
        String observedAt,
        String timezone,
        String source
) {
}
