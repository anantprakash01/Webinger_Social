package com.webinger.collab.creator.service;

import com.webinger.collab.common.Catalog;
import com.webinger.collab.common.web.FieldCheck;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validated GET /creators query (FR-20 – FR-23), with the rules and messages of the frontend's
 * creatorSearchQuerySchema (features/search/schemas.ts). Query strings arrive as text and are coerced.
 */
public record SearchQuery(String q, String platform, String niche, String country, String city, Long followersMin, Long followersMax, Long priceMinCents,
        Long priceMaxCents, String language, String gender, Integer ageMin, Integer ageMax, Boolean fastAccept, String sort, int page, int size) {

    public static final int PAGE_SIZE = 24;
    public static final Set<String> SORTS = Set.of("relevance", "price_asc", "followers_desc", "rating_desc", "newest");
    private static final Pattern INTEGER = Pattern.compile("^\\s*-?\\d+\\s*$");

    public static SearchQuery parse(Map<String, String> params) {
        FieldCheck c = new FieldCheck();
        String q = blankToNull(params.get("q"));
        if (q != null) {
            q = q.trim();
            if (q.length() > 100) c.fail("q", "Use at most 100 characters.");
        }
        String platform = blankToNull(params.get("platform"));
        if (platform != null) c.oneOf("platform", platform, Catalog.PLATFORMS, "Choose a platform.");
        String niche = blankToNull(params.get("niche"));
        if (niche != null && !Catalog.NICHES.containsKey(niche)) c.fail("niche", "Choose a niche from the list.");
        String country = blankToNull(params.get("country"));
        if (country != null) {
            if (country.length() != 2) c.fail("country", "Use a 2-letter country code.");
            country = country.toUpperCase(Locale.ROOT);
        }
        String city = blankToNull(params.get("city"));
        if (city != null) {
            city = city.trim();
            if (city.length() > 80) c.fail("city", "Use at most 80 characters.");
        }
        Long followersMin = number(c, params, "followersMin", 0, null);
        Long followersMax = number(c, params, "followersMax", 0, null);
        Long priceMin = number(c, params, "priceMinCents", 0, null);
        Long priceMax = number(c, params, "priceMaxCents", 0, null);
        String language = blankToNull(params.get("language"));
        if (language != null) {
            if (language.length() != 2) c.fail("language", "Use a 2-letter language code.");
            language = language.toLowerCase(Locale.ROOT);
        }
        String gender = blankToNull(params.get("gender"));
        if (gender != null) c.oneOf("gender", gender, Catalog.GENDERS, "Choose one of the options.");
        Long ageMin = number(c, params, "ageMin", 13, 100L);
        Long ageMax = number(c, params, "ageMax", 13, 100L);
        Boolean fast = null;
        String fastRaw = blankToNull(params.get("fastAccept"));
        if (fastRaw != null) {
            if (fastRaw.equals("true")) fast = true;
            else if (fastRaw.equals("false")) fast = false;
            else c.fail("fastAccept", "Use true or false.");
        }
        String sort = blankToNull(params.get("sort"));
        if (sort == null) sort = "relevance";
        else c.oneOf("sort", sort, SORTS, "Choose a sort order.");
        Long page = number(c, params, "page", 0, null);
        Long size = number(c, params, "size", 1, (long) PAGE_SIZE);

        if (followersMin != null && followersMax != null && followersMin > followersMax) c.fail("followersMin", "Minimum followers must not exceed the maximum.");
        if (priceMin != null && priceMax != null && priceMin > priceMax) c.fail("priceMinCents", "Minimum price must not exceed the maximum.");
        if (ageMin != null && ageMax != null && ageMin > ageMax) c.fail("ageMin", "Minimum age must not exceed the maximum.");
        c.throwIfAny();
        return new SearchQuery(q == null || q.isEmpty() ? null : q, platform, niche, country, city, followersMin, followersMax, priceMin, priceMax, language, gender,
                ageMin == null ? null : ageMin.intValue(), ageMax == null ? null : ageMax.intValue(), fast, sort, page == null ? 0 : page.intValue(),
                size == null ? PAGE_SIZE : size.intValue());
    }

    private static String blankToNull(String s) {
        return s == null || s.isEmpty() ? null : s;
    }

    private static Long number(FieldCheck c, Map<String, String> params, String field, long min, Long max) {
        String raw = blankToNull(params.get(field));
        if (raw == null) return null;
        if (!INTEGER.matcher(raw).matches() || raw.trim().length() > 18) return c.fail(field, "Must be a whole number.");
        long v = Long.parseLong(raw.trim());
        if (v < min) return c.fail(field, "Must be at least " + min + ".");
        if (max != null && v > max) return c.fail(field, "Must be at most " + max + ".");
        return v;
    }
}
