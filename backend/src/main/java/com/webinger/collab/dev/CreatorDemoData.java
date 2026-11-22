package com.webinger.collab.dev;

import com.webinger.collab.common.Ulid;
import com.webinger.collab.creator.domain.CreatorPackage;
import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.creator.domain.PayoutAccount;
import com.webinger.collab.creator.domain.PortfolioItem;
import com.webinger.collab.creator.domain.SocialAccount;
import com.webinger.collab.creator.repository.CreatorProfileRepository;
import com.webinger.collab.creator.repository.PackageRepository;
import com.webinger.collab.creator.repository.PayoutAccountRepository;
import com.webinger.collab.creator.repository.PortfolioItemRepository;
import com.webinger.collab.creator.repository.SocialAccountRepository;
import com.webinger.collab.user.domain.Role;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.repository.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

/**
 * Demo creators (app.demo=true): Leo's full profile as in the frontend's seed (seed/creators.ts) and a
 * small invented catalogue covering every vetting state, so search, profiles and the vetting queue have
 * something to show. Invented people, handles and links only (convention 9); art is the frontend's /demo/*.svg.
 */
class CreatorDemoData {
    private static final Duration DAY = Duration.ofDays(1);

    record Social(String platform, long followers, boolean verified) {}

    record Pkg(String platform, String title, long priceCents, int days) {}

    record Person(String username, String name, String gender, int age, String city, String country, List<String> niches, List<String> languages,
            String vetting, int createdDaysAgo, int photo, List<Social> socials, List<Pkg> packages, int portfolio) {}

    static final String LEO_BIO = "Tech and everyday gear from Mumbai. Honest unboxings, desk setups and gadgets that survive monsoon commutes.";

    /** Invented creators: 12 approved, 2 waiting for review, 1 rejected. */
    static final List<Person> PEOPLE = List.of(
            new Person("anayabeauty", "Anaya Kapoor", "FEMALE", 26, "Delhi", "IN", List.of("BEAUTY", "FASHION"), List.of("en", "hi"), "APPROVED", 300, 2,
                    List.of(new Social("INSTAGRAM", 412_000, true), new Social("YOUTUBE", 96_000, true)),
                    List.of(new Pkg("INSTAGRAM", "Instagram Reel with a product demo", 2_500_000, 7), new Pkg("YOUTUBE", "YouTube review (8–10 min)", 6_000_000, 14)), 8),
            new Person("kabirfits", "Kabir Singh", "MALE", 29, "Bengaluru", "IN", List.of("FITNESS", "WELLNESS"), List.of("en", "hi", "kn"), "APPROVED", 250, 3,
                    List.of(new Social("INSTAGRAM", 88_500, true), new Social("TIKTOK", 31_000, false)),
                    List.of(new Pkg("INSTAGRAM", "Workout Reel featuring your product", 900_000, 5), new Pkg("TIKTOK", "Short challenge video", 600_000, 4)), 6),
            new Person("meeracooks", "Meera Nair", "FEMALE", 34, "Kochi", "IN", List.of("FOOD", "HOME"), List.of("en", "ml"), "APPROVED", 180, 4,
                    List.of(new Social("YOUTUBE", 230_000, true), new Social("INSTAGRAM", 54_000, false)),
                    List.of(new Pkg("YOUTUBE", "Recipe video with your ingredient", 3_500_000, 12), new Pkg("INSTAGRAM", "Kitchen Reel", 1_100_000, 6)), 9),
            new Person("rohantech", "Rohan Desai", "MALE", 24, "Pune", "IN", List.of("TECH", "GAMING"), List.of("en", "mr"), "APPROVED", 120, 5,
                    List.of(new Social("YOUTUBE", 1_240_000, true), new Social("INSTAGRAM", 150_000, true)),
                    List.of(new Pkg("YOUTUBE", "Dedicated tech review", 12_000_000, 21), new Pkg("INSTAGRAM", "Unboxing Reel", 2_000_000, 7)), 10),
            new Person("priyatravels", "Priya Menon", "FEMALE", 31, "Goa", "IN", List.of("TRAVEL", "LIFESTYLE"), List.of("en"), "APPROVED", 400, 6,
                    List.of(new Social("INSTAGRAM", 67_000, true)),
                    List.of(new Pkg("INSTAGRAM", "Stay feature: 1 Reel + 3 Stories", 1_800_000, 10)), 12),
            new Person("arjunlaughs", "Arjun Rao", "MALE", 27, "Hyderabad", "IN", List.of("COMEDY"), List.of("en", "te", "hi"), "APPROVED", 90, 7,
                    List.of(new Social("TIKTOK", 540_000, true), new Social("INSTAGRAM", 210_000, false)),
                    List.of(new Pkg("TIKTOK", "Comedy sketch with your brand", 3_000_000, 7), new Pkg("INSTAGRAM", "Reel cross-post", 1_500_000, 5)), 5),
            new Person("zoyastyle", "Zoya Sheikh", "FEMALE", 22, "Mumbai", "IN", List.of("FASHION", "BEAUTY", "LIFESTYLE"), List.of("en", "hi"), "APPROVED", 60, 8,
                    List.of(new Social("INSTAGRAM", 18_400, false), new Social("TIKTOK", 9_800, false)),
                    List.of(new Pkg("INSTAGRAM", "Outfit Reel", 400_000, 4)), 7),
            new Person("devparents", "Dev & Asha", "NON_BINARY", 36, "Chennai", "IN", List.of("PARENTING", "EDUCATION"), List.of("en", "ta"), "APPROVED", 330, 9,
                    List.of(new Social("YOUTUBE", 75_000, true), new Social("INSTAGRAM", 41_000, true)),
                    List.of(new Pkg("YOUTUBE", "Family-friendly product review", 2_200_000, 14)), 6),
            new Person("ishagreen", "Isha Patel", "FEMALE", 28, "Ahmedabad", "IN", List.of("SUSTAINABILITY", "HOME"), List.of("en", "gu", "hi"), "APPROVED", 45, 10,
                    List.of(new Social("INSTAGRAM", 23_000, false)),
                    List.of(new Pkg("INSTAGRAM", "Low-waste swap Reel", 500_000, 6), new Pkg("UGC", "3 UGC clips for your ads", 900_000, 8)), 4),
            new Person("samfinance", "Samir Joshi", "MALE", 41, "Mumbai", "IN", List.of("FINANCE"), List.of("en", "hi", "mr"), "APPROVED", 500, 11,
                    List.of(new Social("YOUTUBE", 610_000, true)),
                    List.of(new Pkg("YOUTUBE", "Explainer segment (60–90 s)", 5_000_000, 10)), 3),
            new Person("lenapets", "Lena Fischer", "FEMALE", 33, "Berlin", "DE", List.of("PETS"), List.of("de", "en"), "APPROVED", 210, 12,
                    List.of(new Social("INSTAGRAM", 132_000, true), new Social("TIKTOK", 288_000, true)),
                    List.of(new Pkg("TIKTOK", "Pet product TikTok", 1_600_000, 7)), 8),
            new Person("omarugc", "Omar Haddad", "MALE", 30, "Dubai", "AE", List.of("TECH", "AUTOMOTIVE"), List.of("ar", "en"), "APPROVED", 30, 13,
                    List.of(new Social("UGC", 0, false)),
                    List.of(new Pkg("UGC", "UGC video for paid ads", 1_200_000, 5)), 6),
            new Person("tarasings", "Tara Bose", "FEMALE", 25, "Kolkata", "IN", List.of("MUSIC"), List.of("bn", "en"), "PENDING_REVIEW", 8, 14,
                    List.of(new Social("YOUTUBE", 44_000, false)),
                    List.of(new Pkg("YOUTUBE", "Song cover featuring your product", 1_000_000, 10)), 4),
            new Person("vikramdrives", "Vikram Gill", "MALE", 38, "Chandigarh", "IN", List.of("AUTOMOTIVE"), List.of("pa", "hi", "en"), "PENDING_REVIEW", 5, 15,
                    List.of(new Social("INSTAGRAM", 27_000, false)),
                    List.of(new Pkg("INSTAGRAM", "Drive-review Reel", 800_000, 6)), 3),
            new Person("nehaglow", "Neha Verma", "FEMALE", 23, "Lucknow", "IN", List.of("BEAUTY"), List.of("hi"), "REJECTED", 20, 16,
                    List.of(new Social("INSTAGRAM", 3_100, false)),
                    List.of(new Pkg("INSTAGRAM", "Makeup Reel", 300_000, 5)), 2));

    private final UserRepository users;
    private final CreatorProfileRepository profiles;
    private final SocialAccountRepository socials;
    private final PackageRepository packages;
    private final PortfolioItemRepository portfolio;
    private final PayoutAccountRepository payouts;

    CreatorDemoData(UserRepository users, CreatorProfileRepository profiles, SocialAccountRepository socials, PackageRepository packages,
            PortfolioItemRepository portfolio, PayoutAccountRepository payouts) {
        this.users = users;
        this.profiles = profiles;
        this.socials = socials;
        this.packages = packages;
        this.portfolio = portfolio;
        this.payouts = payouts;
    }

    /** Fills in Leo's profile (creator@demo.test), already created as a shell. */
    void leo(CreatorProfile p, Instant now) {
        Person leo = new Person("leomakes", "Leo Fernandes", "MALE", 31, "Mumbai", "IN", List.of("TECH", "LIFESTYLE"), List.of("en", "hi"), "APPROVED", 210, 1,
                List.of(new Social("INSTAGRAM", 84_200, true), new Social("TIKTOK", 152_000, true), new Social("YOUTUBE", 23_400, false)),
                List.of(new Pkg("INSTAGRAM", "Instagram Reel", 1_200_000, 5), new Pkg("TIKTOK", "TikTok video", 1_500_000, 5),
                        new Pkg("YOUTUBE", "YouTube integration (60–90 s)", 4_000_000, 14), new Pkg("INSTAGRAM", "3 Instagram Stories", 600_000, 3)),
                9);
        fill(p, leo, now, LEO_BIO, "/demo/cover-01.svg");
    }

    /** Creates the invented creators with verified emails and the shared demo password hash. */
    void catalogue(String passwordHash, Instant now) {
        for (int i = 0; i < PEOPLE.size(); i++) {
            Person x = PEOPLE.get(i);
            Instant created = now.minus(DAY.multipliedBy(x.createdDaysAgo()));
            User u = new User();
            u.setPublicId(Ulid.next(created.toEpochMilli()));
            u.setEmail(x.username() + "@creators.demo.test");
            u.setName(x.name());
            u.setRole(Role.CREATOR);
            u.setStatus(UserStatus.ACTIVE);
            u.setPasswordHash(passwordHash);
            u.setEmailVerifiedAt(created);
            u.setCreatedAt(created);
            u.setUpdatedAt(created);
            users.save(u);
            CreatorProfile p = new CreatorProfile();
            p.setUserId(u.getId());
            p.setCreatedAt(created);
            String bio = x.name().split(" ")[0] + " makes " + String.join(" and ", x.niches().stream().map(n -> n.toLowerCase().replace('_', ' ')).toList())
                    + " content from " + x.city() + ", with honest reviews and short-form video brands can reuse.";
            fill(p, x, now, bio, i % 3 == 2 ? null : "/demo/cover-" + pad(2 + i % 11) + ".svg");
        }
    }

    private void fill(CreatorProfile p, Person x, Instant now, String bio, String cover) {
        Instant created = now.minus(DAY.multipliedBy(x.createdDaysAgo()));
        p.setUsername(x.username());
        p.setDisplayName(x.name());
        p.setBio(bio);
        p.setCity(x.city());
        p.setCountry(x.country());
        p.setGender(x.gender());
        p.setBirthYear(now.atZone(ZoneOffset.UTC).getYear() - x.age());
        p.setLanguages(new ArrayList<>(x.languages()));
        p.setNiches(new ArrayList<>(x.niches()));
        p.setPhotoUrl("/demo/photo-" + pad(x.photo()) + ".svg");
        p.setCoverUrls(cover == null ? new ArrayList<>() : new ArrayList<>(List.of(cover)));
        p.setVettingStatus(x.vetting());
        p.setPayoutStatus("ENABLED");
        p.setSubmittedAt(created.plus(DAY));
        if ("APPROVED".equals(x.vetting())) p.setApprovedAt(created.plus(DAY.multipliedBy(2)));
        if ("REJECTED".equals(x.vetting())) p.setRejectionReason("Add a clearer profile photo and at least one more social account.");
        p.setProfileViews(x.socials().stream().mapToLong(Social::followers).sum() / 500);
        p.setUpdatedAt(created);
        profiles.save(p);

        for (Social s : x.socials()) {
            SocialAccount a = new SocialAccount();
            a.setPublicId(Ulid.next(created.toEpochMilli()));
            a.setCreatorId(p.getId());
            a.setPlatform(s.platform());
            a.setHandle(x.username());
            a.setFollowers(s.followers());
            a.setEngagementRateBps(s.followers() == 0 ? null : (int) (200 + s.followers() % 400));
            a.setVerifiedAt(s.verified() ? created.plus(DAY) : null);
            a.setCreatedAt(created);
            socials.save(a);
        }
        for (Pkg k : x.packages()) {
            CreatorPackage c = new CreatorPackage();
            c.setPublicId(Ulid.next(created.toEpochMilli()));
            c.setCreatorId(p.getId());
            c.setPlatform(k.platform());
            c.setTitle(k.title());
            c.setDescription(k.title() + ", scripted with you, filmed and edited by me, with one round of changes.");
            c.setDeliverables(new ArrayList<>(List.of("1 " + k.title().toLowerCase(), "Raw footage on request")));
            c.setPriceCents(k.priceCents());
            c.setDeliveryDays(k.days());
            c.setActive(true);
            if (k.days() > 3) c.getAddons().add(new CreatorPackage.Addon(Ulid.next(created.toEpochMilli()), "RUSH", "Rush delivery in " + (k.days() / 2) + " days",
                    Math.max(10_000, k.priceCents() / 4 / 100 * 100), null, k.days() / 2));
            c.getAddons().add(new CreatorPackage.Addon(Ulid.next(created.toEpochMilli()), "USAGE_RIGHTS", "Paid ad usage for 30 days",
                    Math.max(10_000, k.priceCents() / 2 / 100 * 100), 30, null));
            c.setCreatedAt(created);
            c.setUpdatedAt(created);
            packages.save(c);
        }
        for (int i = 0; i < x.portfolio(); i++) {
            PortfolioItem item = new PortfolioItem();
            item.setPublicId(Ulid.next(created.toEpochMilli()));
            item.setCreatorId(p.getId());
            item.setType("IMAGE");
            item.setUrl("/demo/work-" + pad(1 + (x.photo() * 3 + i) % 36) + ".svg");
            item.setSortOrder(i);
            item.setCreatedAt(created);
            portfolio.save(item);
        }
        PayoutAccount a = new PayoutAccount();
        a.setCreatorId(p.getId());
        a.setMethod("BANK_ACCOUNT");
        a.setHolderName(x.name());
        a.setPan("ABCPE" + (1000 + Math.abs(x.username().hashCode()) % 9000) + "F");
        a.setAccountNumber("5010012345" + pad(x.photo()) + "89");
        a.setIfsc("HDFC0001234");
        a.setStatus("VERIFIED");
        a.setCreatedAt(created);
        a.setUpdatedAt(created);
        payouts.save(a);
    }

    private static String pad(int n) {
        return n < 10 ? "0" + n : String.valueOf(n);
    }
}
