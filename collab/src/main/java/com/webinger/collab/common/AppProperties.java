package com.webinger.collab.common;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** `app.*` settings from application.yml. Secrets come from the environment. */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String jwtSecret,
        int accessTokenMinutes,
        int refreshTokenDays,
        boolean cookieSecure,
        String googleClientId,
        boolean demo,
        String webBaseUrl) {}
