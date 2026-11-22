package com.webinger.collab.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.webinger.collab.support.ApiTest;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** GET/PATCH /me and PUT /me/avatar, matching frontend/src/api/mock/handlers/me.ts. */
class MeApiTest extends ApiTest {
    @Autowired
    UserRepository users;

    @Test
    void meMatchesTheContractShape() throws Exception {
        login("brand@demo.test", DEMO_PASSWORD);
        Res me = call("GET", "/me", null);
        assertThat(me.status()).isEqualTo(200);
        assertThat(me.str("$.id")).isEqualTo("01JD0000000000000000BRAND1");
        assertThat(me.str("$.name")).isEqualTo("Maya Iyer");
        assertThat(me.str("$.status")).isEqualTo("ACTIVE");
        assertThat(me.str("$.brand.companyName")).isEqualTo("Saltbay Supply Co.");
        assertThat(me.body()).contains("\"impersonatedBy\":null", "\"avatarUrl\":null", "\"deletionScheduledFor\":null").doesNotContain("\"creator\"");
        assertThat(me.str("$.createdAt")).matches("\\d{4}-\\d{2}-\\d{2}T.*Z");
    }

    @Test
    void renamesWithTheSameRulesAsTheForm() throws Exception {
        login("creator@demo.test", DEMO_PASSWORD);
        Res bad = call("PATCH", "/me", "{\"name\":\" L \"}");
        assertThat(bad.status()).isEqualTo(422);
        assertThat(bad.str("$.errors[0].message")).isEqualTo("Enter at least 2 characters.");
        Res ok = call("PATCH", "/me", "{\"name\":\"  Leo F.  \"}");
        assertThat(ok.str("$.name")).isEqualTo("Leo F.");
    }

    @Test
    void avatarIsTheCreatorPhotoOrBrandLogoAndCreatorsMustKeepOne() throws Exception {
        login("creator@demo.test", DEMO_PASSWORD);
        assertThat(call("PUT", "/me/avatar", "{\"url\":\"/demo/photo-03.svg\"}").str("$.avatarUrl")).isEqualTo("/demo/photo-03.svg");
        Res remove = call("PUT", "/me/avatar", "{\"url\":null}");
        assertThat(remove.status()).isEqualTo(422);
        assertThat(remove.str("$.errors[0].field")).isEqualTo("url");

        login("brand@demo.test", DEMO_PASSWORD);
        assertThat(call("PUT", "/me/avatar", "{\"url\":\"/demo/photo-07.svg\"}").str("$.avatarUrl")).isEqualTo("/demo/photo-07.svg");
        assertThat((Object) call("PUT", "/me/avatar", "{\"url\":null}").get("$.avatarUrl")).isNull();
    }

    @Test
    void aSuspendedAccountIsSignedOutOnItsNextCall() throws Exception {
        login("brand@demo.test", DEMO_PASSWORD);
        users.findByEmail("brand@demo.test").orElseThrow().setStatus(UserStatus.SUSPENDED);
        users.flush();
        Res r = call("GET", "/me", null);
        assertThat(r.status()).isEqualTo(401);
        assertThat(r.code()).isEqualTo("ACCOUNT_SUSPENDED");
        signOutLocally();
        Res again = login("brand@demo.test", DEMO_PASSWORD);
        assertThat(again.status()).isEqualTo(403);
        assertThat(again.code()).isEqualTo("ACCOUNT_SUSPENDED");
    }

    @Test
    void unknownPathsAnswerProblemJson() throws Exception {
        login("brand@demo.test", DEMO_PASSWORD);
        Res r = call("GET", "/nothing-here", null);
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.str("$.title")).isEqualTo("Not found");
    }
}
