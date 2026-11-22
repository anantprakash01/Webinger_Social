package com.webinger.collab.creator;

import static org.assertj.core.api.Assertions.assertThat;

import com.webinger.collab.support.ApiTest;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.repository.UserRepository;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Saved lists (FR-25), ported from the saved-list cases in frontend/src/api/mock/handlers/retention.test.ts. */
class SavedListApiTest extends ApiTest {
    @Autowired
    UserRepository users;

    @BeforeEach
    void signIn() throws Exception {
        login("brand@demo.test", DEMO_PASSWORD);
    }

    String create(String name) throws Exception {
        Res r = call("POST", "/lists", "{\"name\":\"" + name + "\"}");
        assertThat(r.status()).as(r.body()).isEqualTo(201);
        return r.str("$.id");
    }

    /** Distinct timestamps, so "newest first" is well defined. */
    void tick() {
        clock.advance(Duration.ofMillis(5));
    }

    @Test
    void createsListsAddsCreatorsNewestFirstAndShowsTheirCards() throws Exception {
        String id = create("Diwali shortlist");
        assertThat(call("PUT", "/lists/" + id + "/creators/leomakes", null).status()).isEqualTo(200);
        tick();
        Res added = call("PUT", "/lists/" + id + "/creators/AnayaBeauty", null);
        assertThat((List<String>) added.get("$.usernames")).containsExactly("anayabeauty", "leomakes");
        // Adding someone twice changes nothing.
        assertThat((List<String>) call("PUT", "/lists/" + id + "/creators/leomakes", null).get("$.usernames")).hasSize(2);

        Res detail = call("GET", "/lists/" + id, null);
        assertThat(detail.str("$.name")).isEqualTo("Diwali shortlist");
        assertThat((List<String>) detail.get("$.creators[*].username")).containsExactly("anayabeauty", "leomakes");
        assertThat(detail.str("$.creators[1].reach.platform")).isEqualTo("TIKTOK");

        assertThat((List<String>) call("DELETE", "/lists/" + id + "/creators/anayabeauty", null).get("$.usernames")).containsExactly("leomakes");
        assertThat((List<String>) call("GET", "/lists", null).get("$[*].name")).containsExactly("Diwali shortlist");
    }

    @Test
    void namesAreUniquePerBrandIgnoringCaseAndCanBeRenamed() throws Exception {
        String a = create("Food creators");
        tick();
        create("Tech creators");
        Res dup = call("POST", "/lists", "{\"name\":\"food CREATORS\"}");
        assertThat(dup.status()).isEqualTo(409);
        assertThat(dup.code()).isEqualTo("LIST_NAME_TAKEN");
        assertThat(dup.str("$.errors[0].field")).isEqualTo("name");
        assertThat(call("PATCH", "/lists/" + a, "{\"name\":\"Tech creators\"}").code()).isEqualTo("LIST_NAME_TAKEN");
        assertThat(call("PATCH", "/lists/" + a, "{\"name\":\"Food creators\"}").status()).isEqualTo(200); // its own name
        assertThat(call("PATCH", "/lists/" + a, "{\"name\":\"Kitchen\"}").str("$.name")).isEqualTo("Kitchen");
        // Newest list first.
        assertThat((List<String>) call("GET", "/lists", null).get("$[*].name")).containsExactly("Tech creators", "Kitchen");
        assertThat(call("POST", "/lists", "{\"name\":\"x\"}").str("$.errors[0].message")).isEqualTo("Name the list (2+ characters).");
    }

    @Test
    void allowsAtMost20Lists() throws Exception {
        for (int i = 0; i < 20; i++) create("List " + i);
        Res r = call("POST", "/lists", "{\"name\":\"One too many\"}");
        assertThat(r.status()).isEqualTo(409);
        assertThat(r.code()).isEqualTo("LIST_LIMIT");
    }

    @Test
    void onlyApprovedCreatorsCanBeListedAndHiddenOnesDropOutOfTheCards() throws Exception {
        String id = create("Shortlist");
        Res pending = call("PUT", "/lists/" + id + "/creators/tarasings", null);
        assertThat(pending.status()).isEqualTo(404);
        assertThat(pending.code()).isEqualTo("CREATOR_NOT_FOUND");
        call("PUT", "/lists/" + id + "/creators/leomakes", null);
        users.findByEmail("creator@demo.test").orElseThrow().setStatus(UserStatus.SUSPENDED);
        users.flush();
        Res detail = call("GET", "/lists/" + id, null);
        assertThat((List<?>) detail.get("$.creators")).isEmpty();
        assertThat((List<String>) detail.get("$.usernames")).containsExactly("leomakes");
    }

    @Test
    void eachBrandSeesOnlyItsOwnListsAndOnlyBrandsHaveLists() throws Exception {
        String id = create("Private");
        login("unverified@demo.test", DEMO_PASSWORD);
        assertThat((List<?>) call("GET", "/lists", null).get("$")).isEmpty();
        assertThat(call("GET", "/lists/" + id, null).status()).isEqualTo(404);
        assertThat(call("DELETE", "/lists/" + id, null).status()).isEqualTo(404);
        assertThat(call("PUT", "/lists/" + id + "/creators/leomakes", null).status()).isEqualTo(404);
        login("creator@demo.test", DEMO_PASSWORD);
        Res creator = call("GET", "/lists", null);
        assertThat(creator.status()).isEqualTo(403);
        assertThat(creator.code()).isEqualTo("ROLE_NOT_ALLOWED");
        login("brand@demo.test", DEMO_PASSWORD);
        assertThat(call("DELETE", "/lists/" + id, null).status()).isEqualTo(204);
        assertThat(call("GET", "/lists/" + id, null).status()).isEqualTo(404);
    }
}
