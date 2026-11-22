package com.webinger.collab.common.web;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;

/**
 * Collects field errors the way the frontend's Zod schemas report them: the first message per field, in
 * check order, with the same field paths (e.g. `deliverables.0`, `addons.1.rushDays`). Used where a rule
 * needs more than an annotation (conditional fields, cross-field rules, messages that depend on the value).
 *
 * <pre>
 * FieldCheck c = new FieldCheck();
 * String title = c.text("title", body.title(), 3, 80, "Give the package a short title.", "Use at most 80 characters.");
 * c.throwIfAny();
 * </pre>
 */
public final class FieldCheck {
    public static final String DETAIL = "Some fields need your attention.";

    private final Map<String, String> errors = new LinkedHashMap<>();

    /** Records an error unless the field already has one. Always returns null, so callers can `return c.fail(...)`. */
    public <T> T fail(String field, String message) {
        errors.putIfAbsent(field, message);
        return null;
    }

    public boolean has(String field) {
        return errors.containsKey(field);
    }

    public boolean ok() {
        return errors.isEmpty();
    }

    public List<FieldErrorDto> errors() {
        List<FieldErrorDto> out = new ArrayList<>();
        errors.forEach((f, m) -> out.add(new FieldErrorDto(f, m)));
        return out;
    }

    /** 422 VALIDATION_FAILED with every collected error, like the mock's parseBody. */
    public void throwIfAny() {
        if (!errors.isEmpty()) throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, DETAIL, "VALIDATION_FAILED", errors());
    }

    /** Throws a 422 for a single field at once. */
    public static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, DETAIL, "VALIDATION_FAILED", List.of(new FieldErrorDto(field, message)));
    }

    // ---------- Typed checks: each returns the cleaned value, or null after recording an error ----------

    /** Trimmed text of min..max characters. `tooShort` also covers a missing value. */
    public String text(String field, String v, int min, int max, String tooShort, String tooLong) {
        if (v == null) return fail(field, tooShort);
        String s = v.trim();
        if (s.length() < min) return fail(field, tooShort);
        if (s.length() > max) return fail(field, tooLong);
        return s;
    }

    /** Optional trimmed text up to max characters; null stays null. */
    public String optionalText(String field, String v, int max, String tooLong) {
        if (v == null) return null;
        String s = v.trim();
        if (s.length() > max) return fail(field, tooLong);
        return s;
    }

    /** One of the allowed values (exact match). */
    public String oneOf(String field, String v, Set<String> allowed, String message) {
        if (v == null || !allowed.contains(v)) return fail(field, message);
        return v;
    }

    /** Whole number within min..max. Fractions never reach here: the JSON reader refuses them (accept-float-as-int off). */
    public Long whole(String field, Long v, long min, long max, String missing, String tooSmall, String tooBig) {
        if (v == null) return fail(field, missing);
        if (v < min) return fail(field, tooSmall);
        if (v > max) return fail(field, tooBig);
        return v;
    }

    public Integer whole(String field, Integer v, int min, int max, String missing, String tooSmall, String tooBig) {
        Long l = whole(field, v == null ? null : v.longValue(), min, max, missing, tooSmall, tooBig);
        return l == null ? null : l.intValue();
    }

    public boolean matches(String field, String v, Pattern p, String message) {
        if (v == null || !p.matcher(v).matches()) {
            fail(field, message);
            return false;
        }
        return true;
    }
}
