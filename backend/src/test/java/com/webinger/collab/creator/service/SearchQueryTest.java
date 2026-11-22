package com.webinger.collab.creator.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.creator.domain.CreatorProfile;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** GET /creators query rules (frontend features/search/schemas.ts) and keyword relevance (FR-20). */
class SearchQueryTest {

    @Test
    void appliesDefaultsAndNormalisesCase() {
        SearchQuery q = SearchQuery.parse(Map.of("country", "in", "language", "HI", "q", "  tech  "));
        assertThat(q.sort()).isEqualTo("relevance");
        assertThat(q.page()).isZero();
        assertThat(q.size()).isEqualTo(24);
        assertThat(q.country()).isEqualTo("IN");
        assertThat(q.language()).isEqualTo("hi");
        assertThat(q.q()).isEqualTo("tech");
        assertThat(SearchQuery.parse(Map.of("q", "   ")).q()).isNull();
    }

    @Test
    void ignoresEmptyParametersLikeAnAbsentFilter() {
        SearchQuery q = SearchQuery.parse(Map.of("platform", "", "followersMin", "", "sort", ""));
        assertThat(q.platform()).isNull();
        assertThat(q.followersMin()).isNull();
        assertThat(q.sort()).isEqualTo("relevance");
    }

    @Test
    void reportsEveryBadFieldWithTheFormsMessages() {
        assertThatThrownBy(() -> SearchQuery.parse(Map.of("size", "25", "page", "1.5", "ageMax", "101", "priceMinCents", "9", "priceMaxCents", "1")))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.code()).isEqualTo("VALIDATION_FAILED");
                    assertThat(e.errors()).extracting("field", "message").containsExactlyInAnyOrder(
                            org.assertj.core.groups.Tuple.tuple("size", "Must be at most 24."),
                            org.assertj.core.groups.Tuple.tuple("page", "Must be a whole number."),
                            org.assertj.core.groups.Tuple.tuple("ageMax", "Must be at most 100."),
                            org.assertj.core.groups.Tuple.tuple("priceMinCents", "Minimum price must not exceed the maximum."));
                });
    }

    static CreatorProfile creator(String name, String username, String bio, List<String> niches) {
        CreatorProfile p = new CreatorProfile();
        p.setDisplayName(name);
        p.setUsername(username);
        p.setBio(bio);
        p.setNiches(niches);
        return p;
    }

    @Test
    void keywordScoreWeighsNameThenNicheThenBioAndNeedsEveryWord() {
        CreatorProfile p = creator("Meera Nair", "meeracooks", "Recipes from Kochi kitchens.", List.of("FOOD"));
        assertThat(CreatorSearchService.keywordScore(p, List.of())).isEqualTo(1);
        assertThat(CreatorSearchService.keywordScore(p, List.of("meera"))).isEqualTo(3);
        assertThat(CreatorSearchService.keywordScore(p, List.of("drink"))).isEqualTo(2); // niche label "Food & drink"
        assertThat(CreatorSearchService.keywordScore(p, List.of("kochi"))).isEqualTo(1);
        assertThat(CreatorSearchService.keywordScore(p, List.of("meera", "kochi"))).isEqualTo(4);
        assertThat(CreatorSearchService.keywordScore(p, List.of("meera", "tech"))).isZero();
    }
}
