package com.xiaoke.springbackend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot 入口。
 */
@SpringBootApplication
public class SpringBackendApplication {

    /**
     * 启动整个 Spring Backend 应用。
     *
     * @param args 启动参数。
     */
    public static void main(String[] args) {
        SpringApplication.run(SpringBackendApplication.class, args);
    }
}
