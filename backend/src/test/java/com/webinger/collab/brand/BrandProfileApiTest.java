package com.webinger.collab.brand;

import static org.assertj.core.api.Assertions.assertThat;

import com.webinger.collab.support.ApiTest;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** GET/PUT /brands/me/profile (FR-05), ported from the brand cases in frontend/src/api/mock/handlers/creatorMe.test.ts. */
class BrandProfileApiTest extends ApiTest {

    @BeforeEach
    void signIn() throws Exception {
        login("unverified@demo.test", DEMO_PASSWORD);
    }

    @SuppressWarnings("unchecked")
    static List<String> fields(Res r) {
        return (List<String>) r.get("$.errors[*].field");
    }

    @Test
    void readsAndSavesTheCompanyProfileNormalisingTheWebsite() throws Exception {
        Res before = call("GET", "/brands/me/profile", null);
        assertThat(before.str("$.companyName")).isEqualTo("Fernhill Tea House");
        assertThat(before.body()).contains("\"plan\":\"FREE\"", "\"website\":null", "\"state\":\"WB\"");

        Res saved = call("PUT", "/brands/me/profile",
                "{\"companyName\":\"Fernhill Teas\",\"website\":\"http://Fernhill.example.com/\",\"industry\":\"FOOD\",\"country\":\"gb\"}");
        assertThat(saved.status()).as(saved.body()).isEqualTo(200);
        assertThat(saved.str("$.companyName")).isEqualTo("Fernhill Teas");
        assertThat(saved.str("$.website")).isEqualTo("https://fernhill.example.com");
        assertThat(saved.str("$.country")).isEqualTo("GB");
        assertThat(saved.str("$.plan")).isEqualTo("FREE");
        // State and GSTIN only apply in India.
        assertThat(saved.body()).contains("\"state\":null", "\"gstin\":null");
        assertThat(call("GET", "/me", null).str("$.brand.companyName")).isEqualTo("Fernhill Teas");
    }

    @Test
    void acceptsABareDomainAndAnEmptyWebsite() throws Exception {
        String body = "{\"companyName\":\"Fernhill\",\"website\":\"%s\",\"industry\":\"FOOD\",\"country\":\"IN\",\"state\":\"wb\"}";
        assertThat(call("PUT", "/brands/me/profile", body.formatted("fernhill.example.com/shop/")).str("$.website")).isEqualTo("https://fernhill.example.com/shop");
        assertThat((Object) call("PUT", "/brands/me/profile", body.formatted("  ")).get("$.website")).isNull();
    }

    @Test
    void validatesAndIsBrandOnly() throws Exception {
        Res bad = call("PUT", "/brands/me/profile", "{\"companyName\":\"X\",\"website\":\"not a site\",\"industry\":\"NOPE\",\"country\":\"GB\"}");
        assertThat(bad.status()).isEqualTo(422);
        assertThat(fields(bad)).containsExactlyInAnyOrder("companyName", "website", "industry");
        assertThat(call("PUT", "/brands/me/profile", "{\"companyName\":\"Fernhill\",\"website\":\"localhost\",\"industry\":\"FOOD\",\"country\":\"GB\"}").status()).isEqualTo(422);
        login("creator@demo.test", DEMO_PASSWORD);
        Res creator = call("GET", "/brands/me/profile", null);
        assertThat(creator.status()).isEqualTo(403);
        assertThat(creator.code()).isEqualTo("ROLE_NOT_ALLOWED");
    }

    @Test
    void indianBrandsNeedAStateAndAMatchingGstin() throws Exception {
        String base = "{\"companyName\":\"Fernhill\",\"industry\":\"FOOD\",\"country\":\"IN\"%s}";
        assertThat(fields(call("PUT", "/brands/me/profile", base.formatted("")))).containsExactly("state");
        Res wrongState = call("PUT", "/brands/me/profile", base.formatted(",\"state\":\"KA\",\"gstin\":\"19AAACS1234B1Z9\""));
        assertThat(wrongState.str("$.errors[0].message")).isEqualTo("A Karnataka GSTIN starts with 29.");
        assertThat(fields(call("PUT", "/brands/me/profile", base.formatted(",\"state\":\"KA\",\"gstin\":\"29-NOT-A-GSTIN\"")))).containsExactly("gstin");
        Res ok = call("PUT", "/brands/me/profile", base.formatted(",\"state\":\"ka\",\"gstin\":\"29aaacs1234b1z9\""));
        assertThat(ok.status()).as(ok.body()).isEqualTo(200);
        assertThat(ok.str("$.state")).isEqualTo("KA");
        assertThat(ok.str("$.gstin")).isEqualTo("29AAACS1234B1Z9");
    }

    @Test
    void theLogoMustBeAnUploadOrHttpsLink() throws Exception {
        String body = "{\"companyName\":\"Fernhill\",\"industry\":\"FOOD\",\"country\":\"GB\",\"logoUrl\":\"%s\"}";
        assertThat(fields(call("PUT", "/brands/me/profile", body.formatted("javascript:alert(1)")))).containsExactly("logoUrl");
        assertThat(call("PUT", "/brands/me/profile", body.formatted("/demo/photo-07.svg")).str("$.logoUrl")).isEqualTo("/demo/photo-07.svg");
        assertThat(call("GET", "/me", null).str("$.avatarUrl")).isEqualTo("/demo/photo-07.svg");
    }
}
