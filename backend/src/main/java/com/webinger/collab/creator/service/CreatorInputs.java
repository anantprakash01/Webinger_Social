package com.webinger.collab.creator.service;

import com.webinger.collab.common.Catalog;
import com.webinger.collab.common.web.FieldCheck;
import com.webinger.collab.common.web.Urls;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Request bodies of the creator module with their rules. Each {@code validated()} trims and normalises like
 * the frontend's Zod schemas (features/creators/schemas.ts, features/retention/schemas.ts,
 * features/payments/schemas.ts), reports the same field paths and messages, and throws 422 VALIDATION_FAILED.
 */
public final class CreatorInputs {
    private CreatorInputs() {}

    public static final int MAX_ACTIVE_PACKAGES = 8; // FR-13
    public static final int MAX_PORTFOLIO_ITEMS = 12; // FR-14
    public static final int MAX_NICHES = 3; // FR-10
    public static final long MIN_PRICE_CENTS = 50_000; // ₹500 (mock fees.ts MIN_PRICE_CENTS)
    public static final long MAX_PRICE_CENTS = 500_000_000; // ₹50,00,000 sanity cap
    public static final long MIN_ADDON_CENTS = 10_000; // ₹100
    public static final int MAX_ADDONS = 5;
    public static final int MIN_AGE = 16;
    public static final int MAX_AGE = 90;

    private static final Pattern USERNAME = Pattern.compile("^[a-z][a-z0-9._]*$");
    private static final Pattern HANDLE = Pattern.compile("^[A-Za-z0-9._]+$");
    private static final Pattern HTTPS_LINK = Pattern.compile("^https://\\S+\\.\\S+");
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Set<String> ADDON_KINDS = Set.of("USAGE_RIGHTS", "RUSH", "EXTRA_REVISION");

    static String lower(String s) {
        return s == null ? null : s.trim().toLowerCase(Locale.ROOT);
    }

    static String upper(String s) {
        return s == null ? null : s.trim().toUpperCase(Locale.ROOT);
    }

    /** Optional picture link: null stays null; otherwise an app path or https URL. */
    static String imageUrl(FieldCheck c, String field, String url) {
        if (url == null) return null;
        String s = url.trim();
        if (s.isEmpty()) return c.fail(field, "Add a picture.");
        if (s.length() > Urls.MAX_LENGTH) return c.fail(field, "Use a shorter link.");
        if (!Urls.isSafeImage(s)) return c.fail(field, "Upload an image instead.");
        return s;
    }

    // ---------- Profile (FR-10) ----------

    public record ProfileInput(String username, String displayName, String bio, String city, String country, String gender, Integer birthYear,
            List<String> languages, List<String> niches, String photoUrl, List<String> coverUrls) {

        public ProfileInput validated(int currentYear) {
            FieldCheck c = new FieldCheck();
            String u = lower(username);
            if (u == null || u.length() < 3) c.fail("username", "Use at least 3 characters.");
            else if (u.length() > 30) c.fail("username", "Use at most 30 characters.");
            else if (!USERNAME.matcher(u).matches()) c.fail("username", "Start with a letter; then letters, numbers, dots or underscores.");
            else if (Catalog.RESERVED_USERNAMES.contains(u)) c.fail("username", "That username is reserved. Try another.");

            String name = c.text("displayName", displayName, 2, 60, "Enter at least 2 characters.", "Use at most 60 characters.");
            String b = c.text("bio", bio, 30, 1000, "Write at least 30 characters so brands know what you do.", "Use at most 1000 characters.");
            String ci = c.text("city", city, 2, 80, "Enter your city.", "Use at most 80 characters.");
            String co = upper(country);
            if (co == null || co.length() != 2) c.fail("country", "Choose your country.");
            if (gender != null && !Catalog.GENDERS.contains(gender)) c.fail("gender", "Choose one of the options.");
            if (birthYear != null) {
                int age = currentYear - birthYear;
                if (age < MIN_AGE || age > MAX_AGE) c.fail("birthYear", "You need to be between " + MIN_AGE + " and " + MAX_AGE + ".");
            }

            List<String> langs = new ArrayList<>();
            if (languages == null || languages.isEmpty()) c.fail("languages", "Choose at least one language.");
            else {
                for (int i = 0; i < languages.size(); i++) {
                    String l = languages.get(i);
                    if (l == null || l.length() != 2) c.fail("languages." + i, "Use a 2-letter language code.");
                    else langs.add(l);
                }
                if (languages.size() > 5) c.fail("languages", "Choose up to 5 languages.");
            }

            if (niches == null || niches.isEmpty()) c.fail("niches", "Choose at least one niche.");
            else {
                for (int i = 0; i < niches.size(); i++) {
                    if (niches.get(i) == null || !Catalog.NICHES.containsKey(niches.get(i))) c.fail("niches." + i, "Choose a niche from the list.");
                }
                if (niches.size() > MAX_NICHES) c.fail("niches", "Choose up to " + MAX_NICHES + " niches.");
                else if (new HashSet<>(niches).size() != niches.size()) c.fail("niches", "Each niche only once.");
            }

            String photo = imageUrl(c, "photoUrl", photoUrl);
            List<String> covers = new ArrayList<>();
            if (coverUrls != null) {
                if (coverUrls.size() > 3) c.fail("coverUrls", "Add up to 3 cover images.");
                for (int i = 0; i < coverUrls.size(); i++) {
                    String url = coverUrls.get(i) == null ? c.fail("coverUrls." + i, "Add a picture.") : imageUrl(c, "coverUrls." + i, coverUrls.get(i));
                    if (url != null) covers.add(url);
                }
            }
            c.throwIfAny();
            return new ProfileInput(u, name, b, ci, co, gender, birthYear, List.copyOf(new LinkedHashSet<>(langs)), List.copyOf(niches), photo, List.copyOf(covers));
        }
    }

    // ---------- Social accounts (FR-11) ----------

    public record SocialInput(String platform, String handle, Long followers) {
        public SocialInput validated() {
            FieldCheck c = new FieldCheck();
            c.oneOf("platform", platform, Catalog.PLATFORMS, "Choose a platform.");
            String h = handle == null ? null : handle.trim().replaceFirst("^@", "");
            if (h == null || h.length() < 2) c.fail("handle", "Enter your handle.");
            else if (h.length() > 40) c.fail("handle", "Use at most 40 characters.");
            else if (!HANDLE.matcher(h).matches()) c.fail("handle", "Letters, numbers, dots and underscores only.");
            c.whole("followers", followers, 0, 1_000_000_000L, "Enter a number.", "Cannot be negative.", "Use at most 1,000,000,000.");
            c.throwIfAny();
            return new SocialInput(platform, h, followers);
        }
    }

    // ---------- Packages (FR-12, FR-13) and add-ons (v2.4) ----------

    public record AddonInput(String id, String kind, String title, Long priceCents, Integer usageDays, Integer rushDays) {}

    public record PackageInput(String platform, String title, String description, List<String> deliverables, Long priceCents, Integer deliveryDays,
            Boolean active, List<AddonInput> addons) {

        public PackageInput validated() {
            FieldCheck c = new FieldCheck();
            c.oneOf("platform", platform, Catalog.PLATFORMS, "Choose a platform.");
            String t = checkTitle(c, title);
            String d = checkDescription(c, description);
            List<String> items = checkDeliverables(c, deliverables);
            price(c, priceCents);
            days(c, deliveryDays);
            List<AddonInput> a = addons == null ? List.of() : checkAddons(c, addons);
            c.throwIfAny();
            return new PackageInput(platform, t, d, items, priceCents, deliveryDays, active == null || active, a);
        }
    }

    /** Any subset of the package fields; at least one. `addons` replaces the add-ons. */
    public record PackagePatch(String platform, String title, String description, List<String> deliverables, Long priceCents, Integer deliveryDays,
            Boolean active, List<AddonInput> addons) {

        public PackagePatch validated() {
            FieldCheck c = new FieldCheck();
            if (platform == null && title == null && description == null && deliverables == null && priceCents == null && deliveryDays == null
                    && active == null && addons == null) {
                throw FieldCheck.invalid("body", "Nothing to change.");
            }
            if (platform != null) c.oneOf("platform", platform, Catalog.PLATFORMS, "Choose a platform.");
            String t = title == null ? null : checkTitle(c, title);
            String d = description == null ? null : checkDescription(c, description);
            List<String> items = deliverables == null ? null : checkDeliverables(c, deliverables);
            if (priceCents != null) price(c, priceCents);
            if (deliveryDays != null) days(c, deliveryDays);
            List<AddonInput> a = addons == null ? null : checkAddons(c, addons);
            c.throwIfAny();
            return new PackagePatch(platform, t, d, items, priceCents, deliveryDays, active, a);
        }
    }

    private static String checkTitle(FieldCheck c, String v) {
        return c.text("title", v, 3, 80, "Give the package a short title.", "Use at most 80 characters.");
    }

    private static String checkDescription(FieldCheck c, String v) {
        return c.text("description", v, 10, 1000, "Describe what the brand gets (at least 10 characters).", "Use at most 1000 characters.");
    }

    private static List<String> checkDeliverables(FieldCheck c, List<String> v) {
        if (v == null || v.isEmpty()) return c.fail("deliverables", "List at least one deliverable.");
        List<String> out = new ArrayList<>();
        for (int i = 0; i < v.size(); i++) out.add(c.text("deliverables." + i, v.get(i), 2, 120, "Too short.", "Use at most 120 characters."));
        if (v.size() > 10) c.fail("deliverables", "List up to 10 deliverables.");
        return out;
    }

    private static void price(FieldCheck c, Long v) {
        c.whole("priceCents", v, MIN_PRICE_CENTS, MAX_PRICE_CENTS, "Enter a price.", "The minimum price is ₹500.", "The maximum price is ₹50,00,000.");
    }

    private static void days(FieldCheck c, Integer v) {
        c.whole("deliveryDays", v, 1, 60, "Enter the number of days.", "Delivery must be 1 to 60 days.", "Delivery must be 1 to 60 days.");
    }

    private static List<AddonInput> checkAddons(FieldCheck c, List<AddonInput> list) {
        List<AddonInput> out = new ArrayList<>();
        for (int i = 0; i < list.size(); i++) {
            AddonInput a = list.get(i);
            String p = "addons." + i + ".";
            if (a == null) {
                c.fail("addons." + i, "Describe the add-on.");
                continue;
            }
            if (a.id() != null && a.id().length() > 40) c.fail(p + "id", "Use at most 40 characters.");
            c.oneOf(p + "kind", a.kind(), ADDON_KINDS, "Choose an add-on type.");
            String t = c.text(p + "title", a.title(), 3, 80, "Name the add-on.", "Use at most 80 characters.");
            c.whole(p + "priceCents", a.priceCents(), MIN_ADDON_CENTS, MAX_PRICE_CENTS, "Enter a price.", "Add-ons start at ₹100.", "The maximum price is ₹50,00,000.");
            if (a.usageDays() != null) c.whole(p + "usageDays", a.usageDays(), 7, 365, "", "Usage rights run 7 to 365 days.", "Usage rights run 7 to 365 days.");
            if (a.rushDays() != null) c.whole(p + "rushDays", a.rushDays(), 1, 59, "", "Rush delivery is 1 to 59 days.", "Rush delivery is 1 to 59 days.");
            if ("USAGE_RIGHTS".equals(a.kind()) && a.usageDays() == null) c.fail(p + "usageDays", "Say for how many days the brand may run ads.");
            if ("RUSH".equals(a.kind()) && a.rushDays() == null) c.fail(p + "rushDays", "Say how fast rush delivery is.");
            out.add(new AddonInput(a.id(), a.kind(), t, a.priceCents(), "USAGE_RIGHTS".equals(a.kind()) ? a.usageDays() : null, "RUSH".equals(a.kind()) ? a.rushDays() : null));
        }
        if (list.size() > MAX_ADDONS) c.fail("addons", "Up to " + MAX_ADDONS + " add-ons.");
        else if (list.stream().filter(x -> x != null).map(AddonInput::kind).distinct().count() != list.stream().filter(x -> x != null).count())
            c.fail("addons", "Offer each kind of add-on once.");
        return out;
    }

    // ---------- Portfolio (FR-14) ----------

    public record PortfolioInput(String type, String url, String caption) {
        public PortfolioInput validated() {
            FieldCheck c = new FieldCheck();
            c.oneOf("type", type, Set.of("IMAGE", "VIDEO_LINK"), "Choose an image or a video link.");
            String u = url == null ? null : url.trim();
            if (u == null || u.isEmpty()) c.fail("url", "Add an image or a link.");
            else if (u.length() > Urls.MAX_LENGTH) c.fail("url", "Use a shorter link.");
            else if ("VIDEO_LINK".equals(type) && !HTTPS_LINK.matcher(u).lookingAt()) c.fail("url", "Paste a full link starting with https://");
            else if ("IMAGE".equals(type) && !Urls.isSafeImage(u)) c.fail("url", "Upload an image instead.");
            String cap = c.optionalText("caption", caption, 140, "Use at most 140 characters.");
            c.throwIfAny();
            return new PortfolioInput(type, u, cap == null || cap.isEmpty() ? null : cap);
        }
    }

    // ---------- Vacation mode (v2.5) ----------

    public record AvailabilityInput(Boolean away, String until, String message) {
        /** Returns the last day away (null = until switched off). */
        public LocalDate validatedUntil(LocalDate today) {
            FieldCheck c = new FieldCheck();
            if (away == null) c.fail("away", "Choose whether you are away.");
            LocalDate date = null;
            if (until != null) {
                if (!DATE.matcher(until).matches()) c.fail("until", "Pick a date.");
                else {
                    try {
                        date = LocalDate.parse(until);
                    } catch (DateTimeParseException e) {
                        c.fail("until", "Pick a date.");
                    }
                }
            }
            if (Boolean.TRUE.equals(away) && date != null) {
                if (date.isBefore(today)) c.fail("until", "Pick today or a later date.");
                else if (date.isAfter(today.plusYears(1))) c.fail("until", "Up to a year ahead.");
            }
            c.optionalText("message", message, 200, "Use at most 200 characters.");
            c.throwIfAny();
            return date;
        }
    }

    // ---------- Payout account (FR-62, India) ----------

    private static final Pattern PAN = Pattern.compile("^[A-Z]{5}[0-9]{4}[A-Z]$");
    private static final Pattern ACCOUNT = Pattern.compile("^[0-9]{9,18}$");
    private static final Pattern IFSC = Pattern.compile("^[A-Z]{4}0[A-Z0-9]{6}$");
    private static final Pattern VPA = Pattern.compile("^[a-zA-Z0-9.\\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$");
    private static final Pattern GSTIN = Pattern.compile(Catalog.GSTIN_PATTERN);

    public record PayoutAccountInput(String pan, String holderName, String method, String accountNumber, String ifsc, String vpa, String gstin) {
        public PayoutAccountInput validated() {
            FieldCheck c = new FieldCheck();
            String p = upper(pan);
            c.matches("pan", p, PAN, "Enter your 10-character PAN, e.g. ABCDE1234F.");
            String holder = c.text("holderName", holderName, 2, 100, "Enter the name on the account.", "Use at most 100 characters.");
            c.oneOf("method", method, Set.of("BANK_ACCOUNT", "UPI"), "Choose a bank account or UPI.");
            String acc = accountNumber == null ? null : accountNumber.trim();
            String code = upper(ifsc);
            String upi = lower(vpa);
            String g = upper(gstin);
            if (g != null && g.isEmpty()) g = null;
            if (g != null) {
                if (!GSTIN.matcher(g).matches()) c.fail("gstin", "Enter a 15-character GSTIN, e.g. 29ABCDE1234F1Z5.");
                else if (p != null && !g.substring(2, 12).equals(p)) c.fail("gstin", "This GSTIN does not belong to the PAN above.");
            }
            if ("BANK_ACCOUNT".equals(method)) {
                if (acc == null || !ACCOUNT.matcher(acc).matches()) c.fail("accountNumber", "Account numbers are 9 to 18 digits.");
                if (code == null || !IFSC.matcher(code).matches()) c.fail("ifsc", "Enter the 11-character IFSC, e.g. HDFC0001234.");
            } else if ("UPI".equals(method) && (upi == null || !VPA.matcher(upi).matches())) {
                c.fail("vpa", "Enter a UPI ID like name@okaxis.");
            }
            c.throwIfAny();
            boolean bank = "BANK_ACCOUNT".equals(method);
            return new PayoutAccountInput(p, holder, method, bank ? acc : null, bank ? code : null, bank ? null : upi, g);
        }
    }

    // ---------- Saved lists (FR-25) ----------

    public record SavedListInput(String name) {
        public String validatedName() {
            FieldCheck c = new FieldCheck();
            String n = c.text("name", name, 2, 60, "Name the list (2+ characters).", "Use at most 60 characters.");
            c.throwIfAny();
            return n;
        }
    }

    // ---------- Admin rejection reason ----------

    public record ReasonInput(String reason) {
        public String validatedReason() {
            FieldCheck c = new FieldCheck();
            String r = c.text("reason", reason, 10, 500, "Give a reason of at least 10 characters.", "Use at most 500 characters.");
            c.throwIfAny();
            return r;
        }
    }
}
