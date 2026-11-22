package com.webinger.collab.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.webinger.collab.auth.repository.RefreshTokenRepository;
import com.webinger.collab.support.ApiTest;
import com.webinger.collab.user.repository.UserRepository;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Port of frontend/src/api/mock/handlers/auth.test.ts: the same cases against the real API. */
class AuthApiTest extends ApiTest {
    @Autowired
    RefreshTokenRepository refreshTokens;

    @Autowired
    UserRepository users;

    private static String tokenFrom(String link) {
        return link.substring(link.indexOf("token=") + 6);
    }

    /** Newest first, like the mock's outbox. */
    private List<Map<String, Object>> outbox(String to) throws Exception {
        return call("GET", "/dev/outbox?to=" + to, null).get("$") instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    private Res register(String role, String name, String email, String password) throws Exception {
        return call("POST", "/auth/register", "{\"role\":\"%s\",\"name\":\"%s\",\"email\":\"%s\",\"password\":\"%s\",\"acceptTerms\":true}".formatted(role, name, email, password));
    }

    @Nested
    class SignUpAndVerify {
        @Test
        void registersAnUnverifiedBrandEmailsALinkAndVerifiesIt() throws Exception {
            Res r = register("BRAND", "Rina Patel", "Rina@Example.test", "secret123");
            assertThat(r.status()).isEqualTo(201);
            assertThat(r.str("$.user.role")).isEqualTo("BRAND");
            assertThat(r.str("$.user.email")).isEqualTo("rina@example.test");
            assertThat((Boolean) r.get("$.user.emailVerified")).isFalse();
            assertThat((Object) r.get("$.user.brand.companyName")).isNull();
            assertThat(r.body()).doesNotContain("\"creator\"");
            assertThat(r.cookie().isHttpOnly()).isTrue();
            assertThat(r.cookie().getPath()).isEqualTo("/api/v1/auth");
            assertThat(r.body()).doesNotContain(refreshCookie);

            var mail = outbox("rina@example.test").getFirst();
            assertThat((String) mail.get("subject")).containsIgnoringCase("confirm");
            Res v = call("POST", "/auth/verify-email", "{\"token\":\"" + tokenFrom((String) mail.get("link")) + "\"}");
            assertThat(v.status()).isEqualTo(200);
            assertThat((Boolean) v.get("$.emailVerified")).isTrue();
            assertThat((Boolean) call("GET", "/me", null).get("$.emailVerified")).isTrue();

            // Single use
            Res again = call("POST", "/auth/verify-email", "{\"token\":\"" + tokenFrom((String) mail.get("link")) + "\"}");
            assertThat(again.status()).isEqualTo(422);
            assertThat(again.code()).isEqualTo("TOKEN_INVALID");
        }

        @Test
        void createsCreatorsAsDraft() throws Exception {
            Res r = register("CREATOR", "Kai Brennan", "kai@example.test", "secret123");
            assertThat((Map<String, Object>) r.get("$.user.creator")).containsEntry("username", null).containsEntry("vettingStatus", "DRAFT").containsEntry("rejectionReason", null);
        }

        @Test
        void answers422WithFieldErrorsAnd409ForATakenEmail() throws Exception {
            Res bad = register("BRAND", "R", "nope", "short");
            assertThat(bad.status()).isEqualTo(422);
            assertThat(bad.code()).isEqualTo("VALIDATION_FAILED");
            assertThat(bad.str("$.title")).isEqualTo("Validation failed");
            List<String> fields = bad.get("$.errors[*].field") instanceof List<?> l ? l.stream().map(String::valueOf).sorted().toList() : List.of();
            assertThat(fields).containsExactly("email", "name", "password");
            assertThat(bad.body()).contains("Enter at least 2 characters.", "Enter a valid email address.", "Use at least 8 characters.");

            Res taken = register("BRAND", "Maya", "brand@demo.test", "secret123");
            assertThat(taken.status()).isEqualTo(409);
            assertThat(taken.code()).isEqualTo("EMAIL_TAKEN");
            assertThat(taken.str("$.errors[0].field")).isEqualTo("email");
        }

        @Test
        void resendIsRefusedOnceVerifiedAndLimitedToFivePerHour() throws Exception {
            login("brand@demo.test", DEMO_PASSWORD);
            Res r = call("POST", "/auth/verify-email/resend", null);
            assertThat(r.status()).isEqualTo(409);
            assertThat(r.code()).isEqualTo("ALREADY_VERIFIED");

            login("unverified@demo.test", DEMO_PASSWORD);
            for (int i = 0; i < 5; i++) assertThat(call("POST", "/auth/verify-email/resend", null).status()).isEqualTo(202);
            Res limited = call("POST", "/auth/verify-email/resend", null);
            assertThat(limited.status()).isEqualTo(429);
            assertThat(limited.code()).isEqualTo("RATE_LIMITED");
        }
    }

    @Nested
    class SignIn {
        @Test
        void signsInTheDemoAccountsWithTheRightRoles() throws Exception {
            assertThat(login("brand@demo.test", DEMO_PASSWORD).str("$.user.role")).isEqualTo("BRAND");
            assertThat(login("creator@demo.test", DEMO_PASSWORD).str("$.user.creator.vettingStatus")).isEqualTo("APPROVED");
            assertThat(login("newcreator@demo.test", DEMO_PASSWORD).str("$.user.creator.vettingStatus")).isEqualTo("DRAFT");
            Res admin = login("admin@demo.test", DEMO_PASSWORD);
            assertThat(admin.str("$.user.role")).isEqualTo("ADMIN");
            assertThat(admin.str("$.user.id")).isEqualTo("01JD0000000000000000ADMIN1");
            assertThat(((Number) admin.get("$.expiresIn")).intValue()).isEqualTo(900);
        }

        @Test
        void givesTheSame401ForUnknownEmailAndWrongPassword() throws Exception {
            Res a = login("nobody@demo.test", DEMO_PASSWORD);
            Res b = login("brand@demo.test", "wrong-pass1");
            assertThat(a.status()).isEqualTo(401);
            assertThat(a.code()).isEqualTo("INVALID_CREDENTIALS");
            assertThat(a.str("$.detail")).isEqualTo(b.str("$.detail"));
        }

        @Test
        void googleNewAddressNeedsARoleThenSignsIn() throws Exception {
            String token = "mock-google:g-100200300:jordan.reyes@gmail.demo.test:Jordan Reyes";
            Res noRole = call("POST", "/auth/oauth/google", "{\"idToken\":\"" + token + "\"}");
            assertThat(noRole.status()).isEqualTo(422);
            assertThat(noRole.code()).isEqualTo("ROLE_REQUIRED");
            Res created = call("POST", "/auth/oauth/google", "{\"idToken\":\"" + token + "\",\"role\":\"CREATOR\"}");
            assertThat(created.status()).isEqualTo(201);
            assertThat(created.str("$.user.role")).isEqualTo("CREATOR");
            assertThat((Boolean) created.get("$.user.emailVerified")).isTrue();
            call("POST", "/auth/logout", null);
            Res again = call("POST", "/auth/oauth/google", "{\"idToken\":\"" + token + "\"}");
            assertThat(again.status()).isEqualTo(200);
            assertThat(again.str("$.user.id")).isEqualTo(created.str("$.user.id"));
            assertThat(call("POST", "/auth/oauth/google", "{\"idToken\":\"not-a-google-token\"}").code()).isEqualTo("GOOGLE_TOKEN_INVALID");
        }
    }

    @Nested
    class Tokens {
        @Test
        void refreshesAnExpiredAccessTokenAndRotatesTheRefreshToken() throws Exception {
            login("brand@demo.test", DEMO_PASSWORD);
            String firstRefresh = refreshCookie;
            clock.advance(Duration.ofMinutes(15).plusSeconds(1));
            Res expired = call("GET", "/me", null);
            assertThat(expired.status()).isEqualTo(401);
            assertThat(expired.code()).isEqualTo("TOKEN_EXPIRED");

            Res refreshed = call("POST", "/auth/refresh", null);
            assertThat(refreshed.status()).isEqualTo(200);
            assertThat(refreshed.str("$.user.email")).isEqualTo("brand@demo.test");
            assertThat(refreshCookie).isNotEqualTo(firstRefresh);
            assertThat(call("GET", "/me", null).str("$.email")).isEqualTo("brand@demo.test");
        }

        @Test
        void reusingARotatedRefreshTokenEndsTheWholeSession() throws Exception {
            login("brand@demo.test", DEMO_PASSWORD);
            String stolen = refreshCookie;
            call("POST", "/auth/refresh", null);
            String current = refreshCookie;
            refreshCookie = stolen;
            Res reuse = call("POST", "/auth/refresh", null);
            assertThat(reuse.status()).isEqualTo(401);
            assertThat(reuse.code()).isEqualTo("REFRESH_REUSED");
            assertThat(reuse.cookie().getMaxAge()).isZero();
            // The legitimate holder is signed out too, and so is the access token.
            assertThat(call("GET", "/me", null).code()).isEqualTo("TOKEN_INVALID");
            refreshCookie = current;
            assertThat(call("POST", "/auth/refresh", null).status()).isEqualTo(401);
        }

        @Test
        void signsOutWhenTheRefreshTokenHasExpiredToo() throws Exception {
            login("brand@demo.test", DEMO_PASSWORD);
            clock.advance(Duration.ofDays(8));
            Res r = call("POST", "/auth/refresh", null);
            assertThat(r.status()).isEqualTo(401);
            assertThat(r.code()).isEqualTo("REFRESH_EXPIRED");
            assertThat(refreshCookie).isNull();
        }

        @Test
        void rejectsCallsWithoutASessionAndAfterLogout() throws Exception {
            assertThat(call("GET", "/me", null).code()).isEqualTo("NOT_AUTHENTICATED");
            login("brand@demo.test", DEMO_PASSWORD);
            String token = accessToken;
            Res out = call("POST", "/auth/logout", null);
            assertThat(out.status()).isEqualTo(204);
            accessToken = token;
            assertThat(call("GET", "/me", null).code()).isEqualTo("TOKEN_INVALID");
            accessToken = "not-a-jwt";
            assertThat(call("GET", "/me", null).code()).isEqualTo("TOKEN_INVALID");
            // Public endpoints still work with a stale token.
            assertThat(login("brand@demo.test", DEMO_PASSWORD).status()).isEqualTo(200);
        }
    }

    @Nested
    class PasswordReset {
        @Test
        void alwaysAnswers202EmailsA30MinuteLinkAndRevokesSessions() throws Exception {
            assertThat(call("POST", "/auth/forgot-password", "{\"email\":\"nobody@demo.test\"}").status()).isEqualTo(202);
            assertThat(outbox("nobody@demo.test")).isEmpty();

            login("creator@demo.test", DEMO_PASSWORD);
            String oldAccess = accessToken;
            call("POST", "/auth/forgot-password", "{\"email\":\"creator@demo.test\"}");
            var mail = outbox("creator@demo.test").getFirst();
            Res reset = call("POST", "/auth/reset-password", "{\"token\":\"" + tokenFrom((String) mail.get("link")) + "\",\"password\":\"newpass99\"}");
            assertThat(reset.status()).isEqualTo(204);
            accessToken = oldAccess;
            assertThat(call("GET", "/me", null).status()).isEqualTo(401);
            Long creatorId = users.findByEmail("creator@demo.test").orElseThrow().getId();
            assertThat(refreshTokens.findAll().stream().filter(t -> t.getUserId().equals(creatorId) && t.getRevokedAt() == null)).isEmpty();

            assertThat(login("creator@demo.test", DEMO_PASSWORD).status()).isEqualTo(401);
            assertThat(login("creator@demo.test", "newpass99").str("$.user.role")).isEqualTo("CREATOR");
            assertThat((String) outbox("creator@demo.test").getFirst().get("subject")).isEqualTo("Your password was changed");
        }

        @Test
        void expiresTheLinkAfter30Minutes() throws Exception {
            call("POST", "/auth/forgot-password", "{\"email\":\"brand@demo.test\"}");
            var mail = outbox("brand@demo.test").getFirst();
            clock.advance(Duration.ofMinutes(30));
            Res r = call("POST", "/auth/reset-password", "{\"token\":\"" + tokenFrom((String) mail.get("link")) + "\",\"password\":\"newpass99\"}");
            assertThat(r.status()).isEqualTo(422);
            assertThat(r.code()).isEqualTo("TOKEN_EXPIRED");
        }

        @Test
        void aNewerLinkReplacesTheOlderOne() throws Exception {
            call("POST", "/auth/forgot-password", "{\"email\":\"brand@demo.test\"}");
            call("POST", "/auth/forgot-password", "{\"email\":\"brand@demo.test\"}");
            var mails = outbox("brand@demo.test");
            String newer = tokenFrom((String) mails.get(0).get("link"));
            String older = tokenFrom((String) mails.get(1).get("link"));
            assertThat(call("POST", "/auth/reset-password", "{\"token\":\"" + older + "\",\"password\":\"newpass99\"}").code()).isEqualTo("TOKEN_INVALID");
            assertThat(call("POST", "/auth/reset-password", "{\"token\":\"" + newer + "\",\"password\":\"newpass99\"}").status()).isEqualTo(204);
        }
    }
}
