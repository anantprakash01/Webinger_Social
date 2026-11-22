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
        String webBaseUrl,
        /** Where uploads are kept until S3 is wired in (local disk: dev, tests, single-instance demo). */
        String uploadDir) {}
