package com.webinger.collab.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class UrlsTest {
    @ParameterizedTest
    @ValueSource(strings = {"/demo/photo-01.svg", "/api/v1/files/avatar/01JD/abc.png", "https://cdn.example.com/a.png", "HTTPS://cdn.example.com/a.png"})
    void acceptsAppPathsAndHttpsLinks(String url) {
        assertThat(Urls.isSafeImage(url)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "javascript:alert(1)", "data:image/png;base64,AA", "http://x.example/a.png", "//evil.example/a.png", "/a b.png", "/a\\b.png",
            "https://", "ftp://x.example/a.png", "photo.png"})
    void refusesEverythingElse(String url) {
        assertThat(Urls.isSafeImage(url)).isFalse();
    }

    @org.junit.jupiter.api.Test
    void refusesNullAndOverlongLinks() {
        assertThat(Urls.isSafeImage(null)).isFalse();
        assertThat(Urls.isSafeImage("/" + "a".repeat(Urls.MAX_LENGTH))).isFalse();
    }
}
