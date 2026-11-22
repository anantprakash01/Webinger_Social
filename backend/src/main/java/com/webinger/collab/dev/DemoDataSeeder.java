package com.webinger.collab.dev;

import com.webinger.collab.brand.domain.BrandProfile;
import com.webinger.collab.brand.repository.BrandProfileRepository;
import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.creator.repository.CreatorProfileRepository;
import com.webinger.collab.creator.repository.PackageRepository;
import com.webinger.collab.creator.repository.PayoutAccountRepository;
import com.webinger.collab.creator.repository.PortfolioItemRepository;
import com.webinger.collab.creator.repository.SocialAccountRepository;
import com.webinger.collab.user.domain.Role;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.repository.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo accounts (app.demo=true only): the same people, emails, password and ids as the frontend's mock
 * (frontend/src/api/mock/db.ts SEED_IDS, demo.ts), so the demo login picker works against this API.
 * Invented people and companies only (convention 9). Runs once: skipped when the accounts exist.
 */
@Component
@ConditionalOnProperty(prefix = "app", name = "demo", havingValue = "true")
public class DemoDataSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);
    public static final String DEMO_PASSWORD = "demo1234";

    private final UserRepository users;
    private final BrandProfileRepository brands;
    private final CreatorProfileRepository creators;
    private final PasswordEncoder passwords;
    private final Clock clock;
    private final CreatorDemoData creatorData;

    public DemoDataSeeder(UserRepository users, BrandProfileRepository brands, CreatorProfileRepository creators, PasswordEncoder passwords, Clock clock,
            SocialAccountRepository socials, PackageRepository packages, PortfolioItemRepository portfolio, PayoutAccountRepository payouts) {
        this.users = users;
        this.brands = brands;
        this.creators = creators;
        this.passwords = passwords;
        this.clock = clock;
        this.creatorData = new CreatorDemoData(users, creators, socials, packages, portfolio, payouts);
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (users.existsByEmail("brand@demo.test")) return;
        Instant at = clock.instant().minus(Duration.ofDays(30));
        String hash = passwords.encode(DEMO_PASSWORD);

        User maya = user("01JD0000000000000000BRAND1", "brand@demo.test", "Maya Iyer", Role.BRAND, true, hash, at);
        brand(maya, "Saltbay Supply Co.", "https://saltbay.example.com", "HOME", "KA", "29AAACS1234B1Z9", at);
        User theo = user("01JD0000000000000000BRAND2", "unverified@demo.test", "Theo Pinto", Role.BRAND, false, hash, at);
        brand(theo, "Fernhill Tea House", null, "FOOD", "WB", null, at);
        User leo = user("01JD000000000000000CREATR1", "creator@demo.test", "Leo Fernandes", Role.CREATOR, true, hash, at);
        creatorData.leo(creator(leo, "leomakes", "APPROVED", "ENABLED", at), clock.instant());
        User ivy = user("01JD000000000000000CREATR2", "newcreator@demo.test", "Ivy Mathew", Role.CREATOR, true, hash, at);
        creator(ivy, null, "DRAFT", "NOT_STARTED", at);
        user("01JD0000000000000000ADMIN1", "admin@demo.test", "Sam Mehta", Role.ADMIN, true, hash, at);
        creatorData.catalogue(hash, clock.instant());
        log.info("Demo accounts created (password {}): brand@demo.test, unverified@demo.test, creator@demo.test, newcreator@demo.test, admin@demo.test, "
                + "plus {} invented creators (<username>@creators.demo.test)", DEMO_PASSWORD, CreatorDemoData.PEOPLE.size());
    }

    private User user(String id, String email, String name, Role role, boolean verified, String hash, Instant at) {
        User u = new User();
        u.setPublicId(id);
        u.setEmail(email);
        u.setName(name);
        u.setRole(role);
        u.setStatus(UserStatus.ACTIVE);
        u.setPasswordHash(hash);
        u.setEmailVerifiedAt(verified ? at : null);
        u.setCreatedAt(at);
        u.setUpdatedAt(at);
        return users.save(u);
    }

    private void brand(User u, String company, String website, String industry, String state, String gstin, Instant at) {
        BrandProfile b = new BrandProfile();
        b.setUserId(u.getId());
        b.setCompanyName(company);
        b.setWebsite(website);
        b.setIndustry(industry);
        b.setCountry("IN");
        b.setState(state);
        b.setGstin(gstin);
        b.setCreatedAt(at);
        b.setUpdatedAt(at);
        brands.save(b);
    }

    private CreatorProfile creator(User u, String username, String vetting, String payout, Instant at) {
        CreatorProfile p = new CreatorProfile();
        p.setUserId(u.getId());
        p.setUsername(username);
        p.setDisplayName(u.getName());
        p.setVettingStatus(vetting);
        p.setPayoutStatus(payout);
        p.setCreatedAt(at);
        p.setUpdatedAt(at);
        return creators.save(p);
    }
}
