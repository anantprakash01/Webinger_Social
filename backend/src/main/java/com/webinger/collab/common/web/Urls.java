package com.webinger.collab.common.web;

/** Which picture links the API stores (photos, covers, logos, portfolio images). */
public final class Urls {
    private Urls() {}

    public static final int MAX_LENGTH = 2048;

    /**
     * An app path (`/api/v1/files/…` from an upload, `/demo/…` art) or an https URL. Anything else —
     * `javascript:`, `data:`, plain http or protocol-relative `//host` links — is refused, so stored links
     * cannot load content from an unexpected origin or scheme.
     */
    public static boolean isSafeImage(String url) {
        if (url == null || url.isEmpty() || url.length() > MAX_LENGTH) return false;
        if (url.chars().anyMatch(ch -> Character.isWhitespace(ch) || Character.isISOControl(ch))) return false;
        if (url.startsWith("/")) return !url.startsWith("//") && !url.contains("\\");
        return url.regionMatches(true, 0, "https://", 0, 8) && url.length() > 8;
    }
}
