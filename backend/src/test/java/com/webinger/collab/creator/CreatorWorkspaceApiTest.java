package com.webinger.collab.creator;

import static org.assertj.core.api.Assertions.assertThat;

import com.webinger.collab.support.ApiTest;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * The creator workspace under /creators/me, ported from frontend/src/api/mock/handlers/creatorMe.test.ts,
 * plus add-ons, availability and payout-account cases from the mock handlers.
 */
class CreatorWorkspaceApiTest extends ApiTest {

    static final String VALID_PROFILE = """
            {"username":"ivycooks","displayName":"Ivy Mathew","bio":"Weeknight recipes and honest kitchen gadget reviews from a tiny flat.",
             "city":"Toronto","country":"CA","languages":["en"],"niches":["FOOD","HOME"],"photoUrl":"/demo/photo-05.svg","coverUrls":[]}""";

    static String profile(String overrides) {
        return VALID_PROFILE.substring(0, VALID_PROFILE.lastIndexOf('}')) + (overrides.isEmpty() ? "" : "," + overrides) + "}";
    }

    static String pkg(String overrides) {
        String base = """
                {"platform":"INSTAGRAM","title":"Instagram Reel","description":"One 30–60 s Reel featuring your product.",
                 "deliverables":["1 Reel"],"priceCents":1200000,"deliveryDays":5,"active":true""";
        return base + (overrides.isEmpty() ? "" : "," + overrides) + "}";
    }

    static final String VALID_PAYOUT = """
            {"pan":"ABCDE1234F","holderName":"Ivy Mathew","method":"BANK_ACCOUNT","accountNumber":"50100123456789","ifsc":"HDFC0001234"}""";

    @BeforeEach
    void signInAsDraftCreator() throws Exception {
        login("newcreator@demo.test", DEMO_PASSWORD);
    }

    /** The response is the given status and, if set, code; returns it for more checks. */
    Res expect(Res r, int status, String code) {
        assertThat(r.status()).as(r.body()).isEqualTo(status);
        if (code != null) assertThat(r.code()).isEqualTo(code);
        return r;
    }

    @SuppressWarnings("unchecked")
    static List<String> fields(Res r) {
        return (List<String>) r.get("$.errors[*].field");
    }

    @Nested
    class Profile {
        @Test
        void startsAsAnEmptyDraftWithAChecklist() throws Exception {
            Res me = expect(call("GET", "/creators/me", null), 200, null);
            assertThat(me.str("$.vettingStatus")).isEqualTo("DRAFT");
            assertThat((Map<String, Object>) me.get("$.checklist")).containsExactlyInAnyOrderEntriesOf(
                    Map.of("profile", false, "photo", false, "socials", false, "packages", false, "portfolio", false, "payouts", false));
            assertThat((Boolean) me.get("$.usernameLocked")).isFalse();
            assertThat(me.body()).contains("\"availability\":{\"away\":false,\"until\":null,\"message\":null}", "\"username\":null", "\"submittedAt\":null");
        }

        @Test
        void savesAValidProfileAndUpdatesTheSignedInName() throws Exception {
            Res me = expect(call("PUT", "/creators/me/profile", profile("\"displayName\":\"Ivy S.\"")), 200, null);
            assertThat(me.str("$.username")).isEqualTo("ivycooks");
            assertThat((List<String>) me.get("$.niches")).containsExactly("FOOD", "HOME");
            assertThat((Boolean) me.get("$.checklist.profile")).isTrue();
            assertThat((Boolean) me.get("$.checklist.photo")).isTrue();
            assertThat(call("GET", "/me", null).str("$.name")).isEqualTo("Ivy S.");
            assertThat(call("GET", "/me", null).str("$.creator.username")).isEqualTo("ivycooks");
        }

        @Test
        void normalisesUsernameCountryAndDuplicateLanguages() throws Exception {
            Res me = expect(call("PUT", "/creators/me/profile", profile("\"username\":\"  IvyCooks \",\"country\":\"ca\",\"languages\":[\"en\",\"hi\",\"en\"]")), 200, null);
            assertThat(me.str("$.username")).isEqualTo("ivycooks");
            assertThat(me.str("$.country")).isEqualTo("CA");
            assertThat((List<String>) me.get("$.languages")).containsExactly("en", "hi");
        }

        @Test
        void rejectsBadInputWithFieldErrors() throws Exception {
            Res e = expect(call("PUT", "/creators/me/profile", profile("\"username\":\"9bad name\",\"bio\":\"too short\",\"niches\":[\"FOOD\",\"HOME\",\"PETS\",\"TECH\"]")), 422,
                    "VALIDATION_FAILED");
            assertThat(fields(e)).containsExactlyInAnyOrder("bio", "niches", "username");
            assertThat(e.str("$.detail")).isEqualTo("Some fields need your attention.");
            assertThat(e.body()).contains("Write at least 30 characters so brands know what you do.", "Choose up to 3 niches.");

            Res reserved = expect(call("PUT", "/creators/me/profile", profile("\"username\":\"admin\"")), 422, null);
            assertThat(reserved.str("$.errors[0].message")).isEqualTo("That username is reserved. Try another.");
            int year = LocalDate.now(ZoneOffset.UTC).getYear();
            assertThat(fields(expect(call("PUT", "/creators/me/profile", profile("\"birthYear\":" + (year - 10))), 422, null))).containsExactly("birthYear");
            assertThat(fields(expect(call("PUT", "/creators/me/profile", profile("\"niches\":[\"FOOD\",\"FOOD\"]")), 422, null))).containsExactly("niches");
            assertThat(fields(expect(call("PUT", "/creators/me/profile", profile("\"niches\":[\"KNITTING\"]")), 422, null))).containsExactly("niches.0");
            assertThat(fields(expect(call("PUT", "/creators/me/profile", profile("\"gender\":\"OTHER\"")), 422, null))).containsExactly("gender");
            assertThat(call("PUT", "/creators/me/profile", profile("\"birthYear\":" + (year - 16) + ",\"gender\":\"FEMALE\"")).status()).isEqualTo(200);
        }

        @Test
        void refusesUnsafePictureLinks() throws Exception {
            for (String bad : List.of("javascript:alert(1)", "//evil.example/x.png", "http://plain.example/x.png", "data:image/png;base64,AAAA")) {
                Res e = expect(call("PUT", "/creators/me/profile", profile("\"photoUrl\":\"" + bad + "\"")), 422, null);
                assertThat(fields(e)).containsExactly("photoUrl");
            }
            assertThat(call("PUT", "/creators/me/profile", profile("\"photoUrl\":\"https://cdn.example.com/me.png\",\"coverUrls\":[\"/api/v1/files/cover/x.png\"]")).status())
                    .isEqualTo(200);
        }

        @Test
        void keepsUsernamesUniqueAndLocksThemAfterApproval() throws Exception {
            Res taken = expect(call("PUT", "/creators/me/profile", profile("\"username\":\"LeoMakes\"")), 409, "USERNAME_TAKEN");
            assertThat(fields(taken)).containsExactly("username");

            login("creator@demo.test", DEMO_PASSWORD);
            Res leo = call("GET", "/creators/me", null);
            assertThat((Boolean) leo.get("$.usernameLocked")).isTrue();
            expect(call("PUT", "/creators/me/profile", profile("\"username\":\"leonew\"")), 409, "USERNAME_LOCKED");
            // Keeping the same username while editing the rest is fine.
            assertThat(call("PUT", "/creators/me/profile", profile("\"username\":\"leomakes\",\"displayName\":\"Leo F.\"")).str("$.displayName")).isEqualTo("Leo F.");
        }

        @Test
        void isCreatorOnlyAndNeedsASignIn() throws Exception {
            login("brand@demo.test", DEMO_PASSWORD);
            expect(call("GET", "/creators/me", null), 403, "ROLE_NOT_ALLOWED");
            signOutLocally();
            expect(call("GET", "/creators/me", null), 401, null);
            expect(call("PUT", "/creators/me/profile", VALID_PROFILE), 401, null);
        }
    }

    @Nested
    class SocialAccounts {
        @Test
        void addsOneAccountPerPlatformAndRemovesIt() throws Exception {
            Res s = expect(call("POST", "/creators/me/social-accounts", "{\"platform\":\"TIKTOK\",\"handle\":\"@ivy.cooks\",\"followers\":12500}"), 201, null);
            assertThat(s.str("$.handle")).isEqualTo("ivy.cooks");
            assertThat((Boolean) s.get("$.verified")).isFalse();
            assertThat(s.str("$.id")).hasSize(26);
            expect(call("POST", "/creators/me/social-accounts", "{\"platform\":\"TIKTOK\",\"handle\":\"other\",\"followers\":1}"), 409, "PLATFORM_EXISTS");
            Res bad = expect(call("POST", "/creators/me/social-accounts", "{\"platform\":\"INSTAGRAM\",\"handle\":\"bad handle!\",\"followers\":-1}"), 422, null);
            assertThat(fields(bad)).containsExactlyInAnyOrder("handle", "followers");
            expect(call("POST", "/creators/me/social-accounts", "{\"platform\":\"MYSPACE\",\"handle\":\"ivy\",\"followers\":1}"), 422, null);
            expect(call("DELETE", "/creators/me/social-accounts/" + s.str("$.id"), null), 204, null);
            assertThat((List<?>) call("GET", "/creators/me", null).get("$.socials")).isEmpty();
        }

        @Test
        void cannotRemoveSomeoneElsesAccount() throws Exception {
            login("creator@demo.test", DEMO_PASSWORD);
            String leoSocial = call("GET", "/creators/me", null).str("$.socials[0].id");
            login("newcreator@demo.test", DEMO_PASSWORD);
            expect(call("DELETE", "/creators/me/social-accounts/" + leoSocial, null), 404, "NOT_FOUND");
        }

        @Test
        void listsTheBiggestAccountFirst() throws Exception {
            call("POST", "/creators/me/social-accounts", "{\"platform\":\"INSTAGRAM\",\"handle\":\"ivy\",\"followers\":500}");
            call("POST", "/creators/me/social-accounts", "{\"platform\":\"YOUTUBE\",\"handle\":\"ivy\",\"followers\":9000}");
            assertThat((List<String>) call("GET", "/creators/me", null).get("$.socials[*].platform")).containsExactly("YOUTUBE", "INSTAGRAM");
        }
    }

    @Nested
    class Packages {
        @Test
        void rejectsPriceUnder500RupeesAndDeliveryOutside1To60Days() throws Exception {
            assertThat(fields(expect(call("POST", "/creators/me/packages", pkg("\"priceCents\":49999")), 422, null))).containsExactly("priceCents");
            assertThat(fields(expect(call("POST", "/creators/me/packages", pkg("\"deliveryDays\":0")), 422, null))).containsExactly("deliveryDays");
            assertThat(fields(expect(call("POST", "/creators/me/packages", pkg("\"deliveryDays\":61")), 422, null))).containsExactly("deliveryDays");
            // Money is whole paise: a fraction is refused, never rounded.
            assertThat(fields(expect(call("POST", "/creators/me/packages", pkg("\"priceCents\":1500.5")), 422, null))).containsExactly("priceCents");
            assertThat(fields(expect(call("POST", "/creators/me/packages", pkg("\"priceCents\":\"lots\"")), 422, null))).containsExactly("priceCents");
            Res e = expect(call("POST", "/creators/me/packages", pkg("\"priceCents\":49999")), 422, null);
            assertThat(e.str("$.errors[0].message")).isEqualTo("The minimum price is ₹500.");
            Res ok = expect(call("POST", "/creators/me/packages", pkg("\"priceCents\":50000,\"deliveryDays\":60")), 201, null);
            assertThat(((Number) ok.get("$.priceCents")).longValue()).isEqualTo(50_000);
            assertThat(ok.str("$.currency")).isEqualTo("INR");
        }

        @Test
        void validatesEveryDeliverable() throws Exception {
            Res e = expect(call("POST", "/creators/me/packages", pkg("\"deliverables\":[\"1 Reel\",\"x\"]")), 422, null);
            assertThat(fields(e)).containsExactly("deliverables.1");
            assertThat(fields(expect(call("POST", "/creators/me/packages", pkg("\"deliverables\":[]")), 422, null))).containsExactly("deliverables");
        }

        @Test
        void allowsAtMost8ActivePackages() throws Exception {
            for (int i = 0; i < 8; i++) expect(call("POST", "/creators/me/packages", pkg("\"title\":\"Package " + i + "\"")), 201, null);
            expect(call("POST", "/creators/me/packages", pkg("\"title\":\"Ninth\"")), 409, "PACKAGE_LIMIT");
            String off = expect(call("POST", "/creators/me/packages", pkg("\"title\":\"Ninth, inactive\",\"active\":false")), 201, null).str("$.id");
            expect(call("PATCH", "/creators/me/packages/" + off, "{\"active\":true}"), 409, "PACKAGE_LIMIT");
            String first = call("GET", "/creators/me", null).str("$.packages[0].id"); // active packages come first
            expect(call("PATCH", "/creators/me/packages/" + first, "{\"active\":false}"), 200, null);
            assertThat((Boolean) expect(call("PATCH", "/creators/me/packages/" + off, "{\"active\":true}"), 200, null).get("$.active")).isTrue();
        }

        @Test
        void editsAndDeletesOnlyOwnPackages() throws Exception {
            String id = expect(call("POST", "/creators/me/packages", pkg("")), 201, null).str("$.id");
            Res edited = expect(call("PATCH", "/creators/me/packages/" + id, "{\"priceCents\":1600000,\"title\":\"Reel + Story\"}"), 200, null);
            assertThat(((Number) edited.get("$.priceCents")).longValue()).isEqualTo(1_600_000);
            assertThat(edited.str("$.title")).isEqualTo("Reel + Story");
            assertThat(edited.str("$.description")).isEqualTo("One 30–60 s Reel featuring your product.");
            expect(call("PATCH", "/creators/me/packages/" + id, "{}"), 422, "VALIDATION_FAILED");
            expect(call("DELETE", "/creators/me/packages/" + id, null), 204, null);
            assertThat((List<?>) call("GET", "/creators/me", null).get("$.packages")).isEmpty();

            login("creator@demo.test", DEMO_PASSWORD);
            String leoPkg = call("GET", "/creators/me", null).str("$.packages[0].id");
            login("newcreator@demo.test", DEMO_PASSWORD);
            expect(call("PATCH", "/creators/me/packages/" + leoPkg, "{\"priceCents\":50000}"), 404, "NOT_FOUND");
            expect(call("DELETE", "/creators/me/packages/" + leoPkg, null), 404, "NOT_FOUND");
        }

        @Test
        void addOnsKeepTheirIdsAndRushMustBeFasterThanThePackage() throws Exception {
            String addons = """
                    "addons":[{"kind":"RUSH","title":"Rush delivery in 2 days","priceCents":20000,"rushDays":2},
                              {"kind":"USAGE_RIGHTS","title":"Paid ad usage for 30 days","priceCents":50000,"usageDays":30}]""";
            Res k = expect(call("POST", "/creators/me/packages", pkg(addons)), 201, null);
            String rushId = k.str("$.addons[0].id");
            assertThat(k.body()).contains("\"usageDays\":null", "\"rushDays\":2");

            // Re-sending the add-ons (without ids) keeps their ids, so open checkouts still match.
            Res same = expect(call("PATCH", "/creators/me/packages/" + k.str("$.id"), "{" + addons + "}"), 200, null);
            assertThat(same.str("$.addons[0].id")).isEqualTo(rushId);

            // Shortening delivery below the rush time drops the rush add-on.
            Res shorter = expect(call("PATCH", "/creators/me/packages/" + k.str("$.id"), "{\"deliveryDays\":2}"), 200, null);
            assertThat((List<String>) shorter.get("$.addons[*].kind")).containsExactly("USAGE_RIGHTS");

            Res slow = expect(call("POST", "/creators/me/packages", pkg("\"addons\":[{\"kind\":\"RUSH\",\"title\":\"Rush\",\"priceCents\":20000,\"rushDays\":5}]")), 422, null);
            assertThat(slow.str("$.errors[0].message")).isEqualTo("Rush delivery must be under 5 days.");
            Res twice = expect(call("POST", "/creators/me/packages",
                    pkg("\"addons\":[{\"kind\":\"EXTRA_REVISION\",\"title\":\"One more\",\"priceCents\":20000},{\"kind\":\"EXTRA_REVISION\",\"title\":\"Another\",\"priceCents\":20000}]")),
                    422, null);
            assertThat(twice.str("$.errors[0].message")).isEqualTo("Offer each kind of add-on once.");
            Res usage = expect(call("POST", "/creators/me/packages", pkg("\"addons\":[{\"kind\":\"USAGE_RIGHTS\",\"title\":\"Ads\",\"priceCents\":9999}]")), 422, null);
            assertThat(fields(usage)).containsExactlyInAnyOrder("addons.0.priceCents", "addons.0.usageDays");
        }
    }

    @Nested
    class Portfolio {
        @Test
        void addsImagesAndHttpsVideoLinksAtMost12() throws Exception {
            assertThat(fields(expect(call("POST", "/creators/me/portfolio", "{\"type\":\"VIDEO_LINK\",\"url\":\"ftp://x\"}"), 422, null))).containsExactly("url");
            expect(call("POST", "/creators/me/portfolio", "{\"type\":\"VIDEO_LINK\",\"url\":\"https://example.com/v/1\",\"caption\":\"Launch video\"}"), 201, null);
            for (int i = 0; i < 11; i++) expect(call("POST", "/creators/me/portfolio", "{\"type\":\"IMAGE\",\"url\":\"/demo/work-0" + (i % 9 + 1) + ".svg\"}"), 201, null);
            expect(call("POST", "/creators/me/portfolio", "{\"type\":\"IMAGE\",\"url\":\"/demo/work-01.svg\"}"), 409, "PORTFOLIO_LIMIT");
            Res me = call("GET", "/creators/me", null);
            assertThat((List<?>) me.get("$.portfolio")).hasSize(12);
            assertThat(me.str("$.portfolio[0].caption")).isEqualTo("Launch video");
            assertThat((Object) me.get("$.portfolio[1].caption")).isNull();
            expect(call("DELETE", "/creators/me/portfolio/" + me.str("$.portfolio[0].id"), null), 204, null);
            assertThat((List<?>) call("GET", "/creators/me", null).get("$.portfolio")).hasSize(11);
        }

        @Test
        void refusesUnsafeImageLinksAndLongCaptions() throws Exception {
            expect(call("POST", "/creators/me/portfolio", "{\"type\":\"IMAGE\",\"url\":\"javascript:alert(1)\"}"), 422, null);
            Res e = expect(call("POST", "/creators/me/portfolio", "{\"type\":\"IMAGE\",\"url\":\"/demo/work-01.svg\",\"caption\":\"" + "x".repeat(141) + "\"}"), 422, null);
            assertThat(fields(e)).containsExactly("caption");
        }
    }

    @Nested
    class PayoutsAndReview {
        @Test
        void verifiesAPayoutAccountBankOrUpiAndEnablesPayouts() throws Exception {
            assertThat(call("GET", "/payouts/account", null).body()).isEqualTo("null");
            expect(call("PUT", "/payouts/account", VALID_PAYOUT.replace("ABCDE1234F", "ABC123")), 422, null);
            expect(call("PUT", "/payouts/account", VALID_PAYOUT.replace("HDFC0001234", "HDFC1234")), 422, null);
            Res failed = expect(call("PUT", "/payouts/account", VALID_PAYOUT.replace("50100123456789", "000000000")), 200, null);
            assertThat(failed.str("$.status")).isEqualTo("FAILED");
            assertThat(failed.str("$.failureReason")).startsWith("HDFC Bank could not confirm this account.");
            assertThat(call("GET", "/creators/me", null).str("$.payoutStatus")).isEqualTo("PENDING");

            Res ok = expect(call("PUT", "/payouts/account",
                    "{\"pan\":\"abcde1234f\",\"holderName\":\"Ivy Mathew\",\"method\":\"UPI\",\"vpa\":\"Ivy@OkAxis\",\"accountNumber\":null,\"ifsc\":null}"), 200, null);
            assertThat(ok.str("$.status")).isEqualTo("VERIFIED");
            assertThat(ok.str("$.destinationLabel")).isEqualTo("ivy@okaxis");
            assertThat(ok.str("$.panMasked")).isEqualTo("ABCDE••••F");
            assertThat(call("GET", "/creators/me", null).str("$.payoutStatus")).isEqualTo("ENABLED");
            assertThat(call("GET", "/payouts/account", null).str("$.method")).isEqualTo("UPI");
        }

        @Test
        void checksTheGstinAgainstThePan() throws Exception {
            Res e = expect(call("PUT", "/payouts/account", VALID_PAYOUT.replace("}", ",\"gstin\":\"27ZZZZZ9999Z1Z5\"}")), 422, null);
            assertThat(e.str("$.errors[0].message")).isEqualTo("This GSTIN does not belong to the PAN above.");
            Res ok = expect(call("PUT", "/payouts/account", VALID_PAYOUT.replace("}", ",\"gstin\":\"27abcde1234f1z5\"}")), 200, null);
            assertThat(ok.str("$.gstin")).isEqualTo("27ABCDE1234F1Z5");
            assertThat(ok.str("$.destinationLabel")).isEqualTo("HDFC Bank •••• 6789");
        }

        @Test
        void listsWhatIsMissingThenSubmitsThenIsApprovedOrRejectedAndResubmitted() throws Exception {
            Res missing = expect(call("POST", "/creators/me/submit-for-review", null), 422, "PROFILE_INCOMPLETE");
            assertThat(fields(missing)).containsExactly("profile", "photo", "socials", "packages", "payouts");

            expect(call("PUT", "/creators/me/profile", VALID_PROFILE), 200, null);
            expect(call("POST", "/creators/me/social-accounts", "{\"platform\":\"INSTAGRAM\",\"handle\":\"ivycooks\",\"followers\":8000}"), 201, null);
            expect(call("POST", "/creators/me/packages", pkg("")), 201, null);
            expect(call("PUT", "/payouts/account", VALID_PAYOUT), 200, null);

            Res submitted = expect(call("POST", "/creators/me/submit-for-review", null), 200, null);
            assertThat(submitted.str("$.vettingStatus")).isEqualTo("PENDING_REVIEW");
            assertThat(submitted.str("$.submittedAt")).isNotNull();
            expect(call("POST", "/creators/me/submit-for-review", null), 409, "INVALID_VETTING_STATE");
            // Not public while in review.
            assertThat(((Number) call("GET", "/creators?q=ivycooks", null).get("$.totalElements")).intValue()).isZero();

            expect(call("POST", "/dev/vetting-decision", "{\"decision\":\"REJECT\"}"), 422, "REASON_REQUIRED");
            expect(call("POST", "/dev/vetting-decision", "{\"decision\":\"MAYBE\"}"), 422, "VALIDATION_FAILED");
            Res rejected = expect(call("POST", "/dev/vetting-decision", "{\"decision\":\"REJECT\",\"reason\":\"Add a clearer profile photo.\"}"), 200, null);
            assertThat(rejected.str("$.vettingStatus")).isEqualTo("REJECTED");
            assertThat(rejected.str("$.rejectionReason")).isEqualTo("Add a clearer profile photo.");
            assertThat(call("GET", "/me", null).str("$.creator.vettingStatus")).isEqualTo("REJECTED");

            assertThat((Object) expect(call("POST", "/creators/me/submit-for-review", null), 200, null).get("$.rejectionReason")).isNull();
            Res approved = expect(call("POST", "/dev/vetting-decision", "{\"decision\":\"APPROVE\"}"), 200, null);
            assertThat(approved.str("$.vettingStatus")).isEqualTo("APPROVED");
            assertThat((Boolean) approved.get("$.usernameLocked")).isTrue();
            expect(call("POST", "/creators/me/submit-for-review", null), 409, "INVALID_VETTING_STATE");
            assertThat(((Number) call("GET", "/creators?q=ivycooks", null).get("$.totalElements")).intValue()).isEqualTo(1);
        }

        @Test
        void payoutAccountsAreCreatorOnly() throws Exception {
            login("brand@demo.test", DEMO_PASSWORD);
            expect(call("GET", "/payouts/account", null), 403, "ROLE_NOT_ALLOWED");
            expect(call("PUT", "/payouts/account", VALID_PAYOUT), 403, "ROLE_NOT_ALLOWED");
        }
    }

    @Nested
    class StatsAndAvailability {
        @Test
        void reportsViewsActivePackagesAndACountForEveryStatus() throws Exception {
            login("creator@demo.test", DEMO_PASSWORD);
            Res s = expect(call("GET", "/creators/me/stats", null), 200, null);
            assertThat(((Number) s.get("$.activePackages")).intValue()).isEqualTo(4);
            assertThat(((Map<String, Object>) s.get("$.ordersByStatus")).keySet())
                    .containsExactlyInAnyOrder("CLOSED", "COMPLETED", "DELIVERED", "DISPUTED", "IN_PROGRESS", "PENDING_ACCEPTANCE", "REFUNDED");
            assertThat(s.str("$.currency")).isEqualTo("INR");
            long before = ((Number) s.get("$.profileViews")).longValue();
            signOutLocally();
            call("GET", "/creators/leomakes", null);
            login("creator@demo.test", DEMO_PASSWORD);
            assertThat(((Number) call("GET", "/creators/me/stats", null).get("$.profileViews")).longValue()).isEqualTo(before + 1);
        }

        @Test
        void vacationModeShowsOnTheProfileAndSwitchesOffAfterTheLastDay() throws Exception {
            login("creator@demo.test", DEMO_PASSWORD);
            LocalDate today = LocalDate.now(ZoneOffset.UTC);
            expect(call("PUT", "/creators/me/availability", "{\"away\":true,\"until\":\"" + today.minusDays(1) + "\"}"), 422, null);
            expect(call("PUT", "/creators/me/availability", "{\"away\":true,\"until\":\"" + today.plusYears(1).plusDays(1) + "\"}"), 422, null);
            expect(call("PUT", "/creators/me/availability", "{\"away\":true,\"until\":\"tomorrow\"}"), 422, null);
            Res away = expect(call("PUT", "/creators/me/availability", "{\"away\":true,\"until\":\"" + today.plusDays(2) + "\",\"message\":\" Back soon \"}"), 200, null);
            assertThat(away.body()).contains("\"away\":true", "\"until\":\"" + today.plusDays(2) + "\"", "\"message\":\"Back soon\"");
            assertThat((Boolean) call("GET", "/creators/leomakes", null).get("$.away")).isTrue();
            assertThat((Boolean) call("GET", "/creators/leomakes", null).get("$.availability.away")).isTrue();

            clock.advance(Duration.ofDays(3));
            login("creator@demo.test", DEMO_PASSWORD); // the 15-minute access token expired with the clock
            assertThat((Boolean) call("GET", "/creators/leomakes", null).get("$.away")).isFalse();
            assertThat(expect(call("PUT", "/creators/me/availability", "{\"away\":false}"), 200, null).body()).contains("\"away\":false", "\"until\":null");

            login("brand@demo.test", DEMO_PASSWORD);
            expect(call("PUT", "/creators/me/availability", "{\"away\":true}"), 403, "ROLE_NOT_ALLOWED");
        }
    }
}
