package com.webinger.collab.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Base for API tests: the whole app on H2 (MySQL mode) with the demo accounts, a movable clock, and a
 * small client that keeps the access token and refresh cookie like the frontend's api client.
 * Each test runs in a transaction that is rolled back, so the demo data is fresh for the next one.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public abstract class ApiTest {
    public static final String DEMO_PASSWORD = "demo1234";

    @TestConfiguration
    public static class TestClock {
        @Bean
        @Primary
        MutableClock mutableClock() {
            return new MutableClock();
        }
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected MutableClock clock;

    @Autowired
    protected Clock appClock;

    /** The signed-in session, like the frontend client's. */
    protected String accessToken;

    protected String refreshCookie;

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    /** One API call; keeps the tokens a sign-in or refresh hands back. */
    protected Res call(String method, String path, String json) throws Exception {
        return call(method, path, json, null);
    }

    /** With an Idempotency-Key header (money-moving calls), like the frontend client. */
    protected Res call(String method, String path, String json, String idempotencyKey) throws Exception {
        MockHttpServletRequestBuilder b = request(HttpMethod.valueOf(method), "/api/v1" + path).contextPath("/api/v1").accept(MediaType.APPLICATION_JSON);
        if (idempotencyKey != null) b.header("Idempotency-Key", idempotencyKey);
        if (json != null) b.contentType(MediaType.APPLICATION_JSON).content(json);
        if (accessToken != null) b.header("Authorization", "Bearer " + accessToken);
        if (refreshCookie != null) b.cookie(new Cookie("wc_refresh", refreshCookie));
        MvcResult r = mvc.perform(b).andReturn();
        Res res = new Res(r.getResponse().getStatus(), r.getResponse().getContentAsString(), r.getResponse().getCookie("wc_refresh"));
        if (res.status < 300 && res.body.contains("\"accessToken\"")) accessToken = res.str("$.accessToken");
        if (res.cookie != null) refreshCookie = res.cookie.getMaxAge() == 0 ? null : res.cookie.getValue();
        return res;
    }

    protected Res login(String email, String password) throws Exception {
        return call("POST", "/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
    }

    protected void signOutLocally() {
        accessToken = null;
        refreshCookie = null;
    }

    public record Res(int status, String body, Cookie cookie) {
        public String str(String path) {
            return JsonPath.read(body, path);
        }

        public Object get(String path) {
            return JsonPath.read(body, path);
        }

        public String code() {
            return body.isEmpty() ? null : JsonPath.read(body, "$.code");
        }
    }
}
