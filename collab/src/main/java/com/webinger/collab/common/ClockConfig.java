package com.webinger.collab.common;

import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** One clock for the whole app (UTC), so tests can move time like the mock's "Simulate time". */
@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class ClockConfig {
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
