package com.webinger.collab.common;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** One clock for the whole app (UTC), so tests and the demo can move time like the mock's "Simulate time". */
@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class ClockConfig {
    @Bean
    AdjustableClock clock() {
        return new AdjustableClock();
    }
}
