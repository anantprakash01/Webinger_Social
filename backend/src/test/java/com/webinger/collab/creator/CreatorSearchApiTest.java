package com.webinger.collab.creator;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.webinger.collab.support.ApiTest;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Public discovery: GET /creators (FR-20 – FR-24), GET /creators/{username} (FR-15) and suggestions (v2.6).
 * Ported from frontend/src/api/mock/handlers/creators.test.ts, run against the demo catalogue
 * (dev/CreatorDemoData): Leo plus 12 approved, 2 in review and 1 rejected creator, and Ivy's empty draft.
 */
class CreatorSearchApiTest extends ApiTest {
    static final int APPROVED = 13;
    static final Set<String> NOT_LIVE = Set.of("tarasings", "vikramdrives", "nehaglow");

    @Autowired
    UserRepository users;

    /** Every card of a search, across all pages. */
    List<Map<String, Object>> all(String query) throws Exception {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int page = 0; ; page++) {
            Res r = call("GET", "/creators?size=5&page=" + page + (query.isEmpty() ? "" : "&" + query), null);
            assertThat(r.status()).as(r.body()).isEqualTo(200);
            List<Map<String, Object>> content = JsonPath.read(r.body(), "$.content");
            out.addAll(content);
            if (page >= ((Number) r.get("$.totalPages")).intValue() - 1) return out;
        }
    }

    static List<String> usernames(List<Map<String, Object>> cards) {
        return cards.stream().map(c -> (String) c.get("username")).toList();
    }

    static long num(Object o) {
        return o == null ? Long.MIN_VALUE : ((Number) o).longValue();
    }

    @SuppressWarnings("unchecked")
    static long followers(Map<String, Object> card) {
        Map<String, Object> reach = (Map<String, Object>) card.get("reach");
        return reach == null ? 0 : num(reach.get("followers"));
    }

    // ---------- Search ----------

    @Test
    void pagesWithMetadataAndAtMost24PerPage() throws Exception {
        Res r = call("GET", "/creators?size=5", null);
        assertThat((List<?>) r.get("$.content")).hasSize(5);
        assertThat(r.body()).contains("\"page\":0", "\"size\":5", "\"totalElements\":" + APPROVED, "\"totalPages\":3");
        Res last = call("GET", "/creators?size=5&page=2", null);
        assertThat((List<?>) last.get("$.content")).hasSize(APPROVED - 10);
        assertThat((List<?>) call("GET", "/creators?size=5&page=9", null).get("$.content")).isEmpty();
        Res defaults = call("GET", "/creators", null);
        assertThat(defaults.body()).contains("\"size\":24", "\"totalPages\":1");
    }

    @Test
    void neverShowsUnapprovedCreators() throws Exception {
        List<String> visible = usernames(all(""));
        assertThat(visible).hasSize(APPROVED).doesNotContainAnyElementsOf(NOT_LIVE).doesNotContainNull();
    }

    @Test
    void cardsCarryTheFr24Fields() throws Exception {
        Map<String, Object> leo = all("q=leomakes").getFirst();
        assertThat(leo).containsEntry("username", "leomakes").containsEntry("displayName", "Leo Fernandes").containsEntry("verified", true)
                .containsEntry("currency", "INR").containsEntry("city", "Mumbai").containsEntry("country", "IN").containsEntry("away", false)
                .containsEntry("ratingCount", 0).containsEntry("ratingAvg", null);
        assertThat(leo.get("reach")).isEqualTo(Map.of("platform", "TIKTOK", "handle", "leomakes", "followers", 152_000));
        // Cheapest active package: 3 Instagram Stories at ₹6,000.
        assertThat(num(leo.get("startingPriceCents"))).isEqualTo(600_000);
        assertThat(leo.keySet()).containsExactlyInAnyOrder("username", "displayName", "photoUrl", "city", "country", "niches", "reach", "startingPriceCents",
                "currency", "ratingAvg", "ratingCount", "verified", "away");
    }

    @Test
    void keywordSearchNeedsEveryWordToMatchNameBioOrNiche() throws Exception {
        assertThat(usernames(all("q=Leo Fernandes"))).containsExactly("leomakes");
        List<String> tech = usernames(all("q=tech"));
        assertThat(tech).contains("leomakes", "rohantech", "omarugc").doesNotContain("meeracooks");
        // Niche labels count too: FOOD is "Food & drink".
        assertThat(usernames(all("q=drink"))).containsExactly("meeracooks");
        assertThat(all("q=zzzz-nothing-matches")).isEmpty();
        assertThat(all("q=leo zzzz")).isEmpty();
    }

    @Test
    void nameMatchesRankAboveBioMatches() throws Exception {
        // "rohan" is only in Rohan's name; "tech" is in several niches. Rohan matches both words best.
        assertThat(usernames(all("q=rohan tech")).getFirst()).isEqualTo("rohantech");
        assertThat(usernames(all("q=mumbai")).getFirst()).isIn("leomakes", "samfinance", "zoyastyle");
    }

    @Test
    void filtersByPlatformAndReportsThatPlatformsReachAndPrice() throws Exception {
        List<Map<String, Object>> yt = all("platform=YOUTUBE");
        assertThat(yt).isNotEmpty();
        for (Map<String, Object> c : yt) assertThat(((Map<?, ?>) c.get("reach")).get("platform")).isEqualTo("YOUTUBE");
        Map<String, Object> leo = yt.stream().filter(c -> c.get("username").equals("leomakes")).findFirst().orElseThrow();
        assertThat(followers(leo)).isEqualTo(23_400);
        assertThat(num(leo.get("startingPriceCents"))).isEqualTo(4_000_000);
        // A UGC package without a UGC account still lists the creator, with no reach.
        Map<String, Object> isha = all("platform=UGC").stream().filter(c -> c.get("username").equals("ishagreen")).findFirst().orElseThrow();
        assertThat(isha.get("reach")).isNull();
        assertThat(num(isha.get("startingPriceCents"))).isEqualTo(900_000);
    }

    @Test
    void combinesNicheLocationLanguageGenderFollowersPriceAndAgeFilters() throws Exception {
        List<Map<String, Object>> tech = all("niche=TECH&country=in&followersMin=10000&priceMaxCents=2000000");
        assertThat(usernames(tech)).contains("leomakes").doesNotContain("omarugc");
        for (Map<String, Object> c : tech) {
            assertThat((List<String>) c.get("niches")).contains("TECH");
            assertThat(c.get("country")).isEqualTo("IN");
            assertThat(followers(c)).isGreaterThanOrEqualTo(10_000);
            assertThat(num(c.get("startingPriceCents"))).isLessThanOrEqualTo(2_000_000);
        }
        assertThat(usernames(all("language=TA"))).containsExactly("devparents");
        assertThat(usernames(all("gender=NON_BINARY"))).containsExactly("devparents");
        List<String> mumbai = usernames(all("country=IN&city=mumbai"));
        assertThat(mumbai).containsExactlyInAnyOrder("leomakes", "zoyastyle", "samfinance");
        // Ages 25–34 (birth years are seeded from ages): Anaya 26, Kabir 29, Meera 34, Arjun 27, Priya 31, Leo 31, Isha 28, Lena 33, Omar 30.
        assertThat(usernames(all("ageMin=25&ageMax=34"))).containsExactlyInAnyOrder("anayabeauty", "kabirfits", "meeracooks", "arjunlaughs", "priyatravels", "leomakes",
                "ishagreen", "lenapets", "omarugc");
        assertThat(usernames(all("followersMin=1000000"))).containsExactly("rohantech");
        // Starting price is the cheapest package: only Samir starts at ₹50,000 or more.
        assertThat(usernames(all("priceMinCents=5000000"))).containsExactly("samfinance");
    }

    @Test
    void sortsByPriceFollowersRatingAndNewest() throws Exception {
        List<Long> prices = all("sort=price_asc").stream().map(c -> num(c.get("startingPriceCents"))).toList();
        assertThat(prices).isSortedAccordingTo(Comparator.naturalOrder());
        List<Long> reach = all("sort=followers_desc").stream().map(CreatorSearchApiTest::followers).toList();
        assertThat(reach).isSortedAccordingTo(Comparator.reverseOrder());
        // No reviews yet (reviews module): equal ratings fall back to username order.
        assertThat(usernames(all("sort=rating_desc"))).isSortedAccordingTo(Comparator.naturalOrder());
        // Newest approval first: Omar joined 30 days ago, Samir 500.
        List<String> newest = usernames(all("sort=newest"));
        assertThat(newest.getFirst()).isEqualTo("omarugc");
        assertThat(newest.getLast()).isEqualTo("samfinance");
    }

    @Test
    void answers422ForInvalidParameters() throws Exception {
        Map<String, String> cases = Map.of(
                "size=100", "size",
                "followersMin=5000&followersMax=10", "followersMin",
                "platform=MYSPACE", "platform",
                "page=-1", "page",
                "ageMin=5", "ageMin",
                "sort=cheapest", "sort",
                "priceMinCents=abc", "priceMinCents",
                "q=" + "a".repeat(101), "q",
                "fastAccept=maybe", "fastAccept");
        for (var e : cases.entrySet()) {
            Res r = call("GET", "/creators?" + e.getKey(), null);
            assertThat(r.status()).as(e.getKey()).isEqualTo(422);
            assertThat(r.code()).isEqualTo("VALIDATION_FAILED");
            assertThat(r.str("$.errors[0].field")).as(e.getKey()).isEqualTo(e.getValue());
        }
        assertThat(call("GET", "/creators?followersMin=5000&followersMax=10", null).str("$.errors[0].message")).isEqualTo("Minimum followers must not exceed the maximum.");
    }

    @Test
    void acceptsWithin24HoursNeedsOrderHistoryNobodyHasYet() throws Exception {
        assertThat(((Number) call("GET", "/creators?fastAccept=true", null).get("$.totalElements")).intValue()).isZero();
        assertThat(((Number) call("GET", "/creators?fastAccept=false", null).get("$.totalElements")).intValue()).isEqualTo(APPROVED);
    }

    @Test
    void showsANewPackageInSearchRightAwayAndIgnoresSwitchedOffOnes() throws Exception {
        login("creator@demo.test", DEMO_PASSWORD);
        String id = call("POST", "/creators/me/packages", CreatorWorkspaceApiTest.pkg("\"title\":\"Brand new package\",\"priceCents\":50000")).str("$.id");
        assertThat(num(all("q=leomakes").getFirst().get("startingPriceCents"))).isEqualTo(50_000);
        call("PATCH", "/creators/me/packages/" + id, "{\"active\":false}");
        assertThat(num(all("q=leomakes").getFirst().get("startingPriceCents"))).isEqualTo(600_000);
    }

    @Test
    void hidesSuspendedCreatorsFromSearchAndTheirProfile() throws Exception {
        var leo = users.findByEmail("creator@demo.test").orElseThrow();
        leo.setStatus(UserStatus.SUSPENDED);
        users.flush();
        assertThat(usernames(all(""))).doesNotContain("leomakes").hasSize(APPROVED - 1);
        assertThat(call("GET", "/creators/leomakes", null).status()).isEqualTo(404);
    }

    // ---------- Profile ----------

    @Test
    void returnsThePublicProfileWithActivePackagesCheapestFirst() throws Exception {
        Res p = call("GET", "/creators/LeoMakes", null);
        assertThat(p.status()).isEqualTo(200);
        assertThat(p.str("$.username")).isEqualTo("leomakes");
        assertThat(p.str("$.vettingStatus")).isEqualTo("APPROVED");
        assertThat((List<String>) p.get("$.socials[*].platform")).containsExactly("TIKTOK", "INSTAGRAM", "YOUTUBE");
        List<Number> prices = p.get("$.packages[*].priceCents") instanceof List<?> l ? (List<Number>) l : List.of();
        assertThat(prices.stream().map(Number::longValue).toList()).containsExactly(600_000L, 1_200_000L, 1_500_000L, 4_000_000L);
        assertThat((List<?>) p.get("$.portfolio")).hasSize(9);
        assertThat((List<?>) p.get("$.reviews")).isEmpty();
        assertThat((List<?>) p.get("$.packages[0].addons")).isNotEmpty();
        assertThat(p.body()).doesNotContain("\"birthYear\"", "\"gender\"", "\"payoutStatus\"", "\"active\"")
                .contains("\"completedOrders\":0", "\"typicalAcceptHours\":null", "\"myInquiryId\":null", "\"memberSince\":");
        assertThat(p.str("$.bio")).startsWith("Tech and everyday gear");
    }

    @Test
    void hidesInactivePackages() throws Exception {
        login("creator@demo.test", DEMO_PASSWORD);
        String first = call("GET", "/creators/me", null).str("$.packages[0].id");
        call("PATCH", "/creators/me/packages/" + first, "{\"active\":false}");
        assertThat((List<String>) call("GET", "/creators/leomakes", null).get("$.packages[*].id")).doesNotContain(first).hasSize(3);
    }

    @Test
    void answers404ForUnknownAndUnapprovedCreators() throws Exception {
        Res unknown = call("GET", "/creators/nobody-here", null);
        assertThat(unknown.status()).isEqualTo(404);
        assertThat(unknown.code()).isEqualTo("CREATOR_NOT_FOUND");
        for (String u : NOT_LIVE) assertThat(call("GET", "/creators/" + u, null).status()).as(u).isEqualTo(404);
    }

    @Test
    void letsTheOwnerAndAdminsPreviewAnUnapprovedProfile() throws Exception {
        login("tarasings@creators.demo.test", DEMO_PASSWORD);
        assertThat(call("GET", "/creators/tarasings", null).str("$.vettingStatus")).isEqualTo("PENDING_REVIEW");
        login("admin@demo.test", DEMO_PASSWORD);
        assertThat(call("GET", "/creators/tarasings", null).str("$.vettingStatus")).isEqualTo("PENDING_REVIEW");
        login("brand@demo.test", DEMO_PASSWORD);
        assertThat(call("GET", "/creators/tarasings", null).status()).isEqualTo(404);
    }

    @Test
    void aStaleTokenDoesNotBlockPublicPages() throws Exception {
        accessToken = "not-a-real-token";
        assertThat(call("GET", "/creators/leomakes", null).status()).isEqualTo(200);
        assertThat(call("GET", "/creators", null).status()).isEqualTo(200);
    }

    @Test
    void countsViewsFromEveryoneButTheCreator() throws Exception {
        login("creator@demo.test", DEMO_PASSWORD);
        long before = num(call("GET", "/creators/me/stats", null).get("$.profileViews"));
        call("GET", "/creators/leomakes", null); // the owner: not counted
        signOutLocally();
        call("GET", "/creators/leomakes", null); // a visitor
        login("brand@demo.test", DEMO_PASSWORD);
        call("GET", "/creators/leomakes", null); // a brand
        login("creator@demo.test", DEMO_PASSWORD);
        assertThat(num(call("GET", "/creators/me/stats", null).get("$.profileViews"))).isEqualTo(before + 2);
    }

    // ---------- Suggestions ----------

    @Test
    void suggestsNichesAndCitiesThenCreators() throws Exception {
        Res mu = call("GET", "/creators/suggestions?q=mu", null);
        assertThat((List<String>) mu.get("$.suggestions[*].label")).containsExactly("Music", "Mumbai", "Munich");
        assertThat((List<String>) mu.get("$.suggestions[*].value")).containsExactly("MUSIC", "IN:Mumbai", "DE:Munich");
        assertThat(mu.str("$.suggestions[1].detail")).isEqualTo("India");

        Res leo = call("GET", "/creators/suggestions?q=Fern", null);
        assertThat(leo.body()).contains("{\"kind\":\"CREATOR\",\"label\":\"Leo Fernandes\",\"value\":\"leomakes\",\"detail\":\"@leomakes\"}");
        assertThat((List<?>) call("GET", "/creators/suggestions?q=kabirf", null).get("$.suggestions")).hasSize(1);
        // Creators in review are not suggested.
        assertThat((List<?>) call("GET", "/creators/suggestions?q=tara", null).get("$.suggestions")).isEmpty();
        assertThat((List<?>) call("GET", "/creators/suggestions?q= ", null).get("$.suggestions")).isEmpty();
        assertThat(call("GET", "/creators/suggestions", null).status()).isEqualTo(200);
    }

    @Test
    void ageFilterUsesTheServerClock() throws Exception {
        int year = LocalDate.now(ZoneOffset.UTC).getYear();
        assertThat(year).isGreaterThan(2000);
        assertThat(usernames(all("ageMin=40"))).containsExactly("samfinance");
        assertThat(usernames(all("ageMax=24"))).containsExactlyInAnyOrder("rohantech", "zoyastyle");
    }
}
