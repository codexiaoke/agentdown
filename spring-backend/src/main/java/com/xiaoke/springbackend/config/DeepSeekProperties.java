package com.xiaoke.springbackend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Spring AI DeepSeek 低层客户端使用的配置。
 */
@ConfigurationProperties(prefix = "agentdown.deepseek")
public class DeepSeekProperties {

    private String baseUrl = "https://api.deepseek.com/v1";
    private String apiKey = "";
    private String model = "deepseek-chat";
    private double temperature = 0.3;
    private int maxTokens = 1024;
    private String completionsPath = "/chat/completions";

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public double getTemperature() {
        return temperature;
    }

    public void setTemperature(double temperature) {
        this.temperature = temperature;
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = maxTokens;
    }

    public String getCompletionsPath() {
        return completionsPath;
    }

    public void setCompletionsPath(String completionsPath) {
        this.completionsPath = completionsPath;
    }
}
