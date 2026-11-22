package com.webinger.collab.user.service;

import com.webinger.collab.brand.domain.BrandProfile;
import com.webinger.collab.brand.repository.BrandProfileRepository;
import com.webinger.collab.common.Ulid;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.creator.repository.CreatorProfileRepository;
import com.webinger.collab.user.domain.Role;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.repository.UserRepository;
import com.webinger.collab.user.web.MeDto;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Users module: accounts, their profile shell, and the Me view (GET /me). */
@Service
public class UserService {
    private final UserRepository users;
    private final BrandProfileRepository brands;
    private final CreatorProfileRepository creators;
    private final Clock clock;

    public UserService(UserRepository users, BrandProfileRepository brands, CreatorProfileRepository creators, Clock clock) {
        this.users = users;
        this.brands = brands;
        this.creators = creators;
        this.clock = clock;
    }

    public Optional<User> findByEmail(String email) {
        return users.findByEmail(email);
    }

    public Optional<User> findByGoogleSub(String sub) {
        return users.findByGoogleSub(sub);
    }

    public User get(Long id) {
        return users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Please sign in.", "NOT_AUTHENTICATED"));
    }

    public Optional<User> findByPublicId(String publicId) {
        return users.findByPublicId(publicId);
    }

    /** Several users by internal id, in one query. */
    public Map<Long, User> getAll(Collection<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        return users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, Function.identity()));
    }

    /** The account name follows the creator's display name (FR-10). */
    @Transactional
    public void setName(Long userId, String name) {
        User u = get(userId);
        u.setName(name);
        u.setUpdatedAt(clock.instant());
    }

    /** New brand or creator with an empty profile (creators start as DRAFT, FR-16). */
    @Transactional
    public User create(String email, String name, Role role, String passwordHash, String googleSub, boolean verified) {
        Instant now = clock.instant();
        User u = new User();
        u.setPublicId(Ulid.next(now.toEpochMilli()));
        u.setEmail(email);
        u.setName(name);
        u.setRole(role);
        u.setStatus(UserStatus.ACTIVE);
        u.setPasswordHash(passwordHash);
        u.setGoogleSub(googleSub);
        u.setEmailVerifiedAt(verified ? now : null);
        u.setCreatedAt(now);
        u.setUpdatedAt(now);
        users.save(u);
        if (role == Role.CREATOR) {
            CreatorProfile p = new CreatorProfile();
            p.setUserId(u.getId());
            p.setDisplayName(name);
            p.setCreatedAt(now);
            p.setUpdatedAt(now);
            creators.save(p);
        } else if (role == Role.BRAND) {
            BrandProfile b = new BrandProfile();
            b.setUserId(u.getId());
            b.setCreatedAt(now);
            b.setUpdatedAt(now);
            brands.save(b);
        }
        return u;
    }

    @Transactional(readOnly = true)
    public MeDto me(Long userId, String impersonatorName) {
        return toMe(get(userId), impersonatorName);
    }

    /** Contract Me, built like the mock's toMe(): the account picture is the creator photo or brand logo. */
    public MeDto toMe(User u, String impersonatorName) {
        String avatar = u.getAvatarUrl();
        MeDto.CreatorSummary creator = null;
        MeDto.BrandSummary brand = null;
        if (u.getRole() == Role.CREATOR) {
            Optional<CreatorProfile> p = creators.findByUserId(u.getId());
            creator = p.map(c -> new MeDto.CreatorSummary(c.getUsername(), c.getVettingStatus(), c.getRejectionReason())).orElse(null);
            avatar = p.map(CreatorProfile::getPhotoUrl).orElse(null);
        } else if (u.getRole() == Role.BRAND) {
            Optional<BrandProfile> b = brands.findByUserId(u.getId());
            brand = new MeDto.BrandSummary(b.map(BrandProfile::getCompanyName).orElse(null));
            avatar = b.map(BrandProfile::getLogoUrl).orElse(null);
        }
        return new MeDto(u.getPublicId(), u.getEmail(), u.getName(), u.getRole().name(), u.getStatus().name(), u.isEmailVerified(), u.getCreatedAt(),
                impersonatorName, avatar, u.getDeletionScheduledFor(), creator, brand);
    }

    /** PATCH /me: the person's name. */
    @Transactional
    public MeDto rename(Long userId, String name) {
        User u = get(userId);
        if (name != null) {
            u.setName(name);
            creators.findByUserId(u.getId()).filter(c -> c.getDisplayName() == null || c.getDisplayName().isEmpty()).ifPresent(c -> c.setDisplayName(name));
        }
        u.setUpdatedAt(clock.instant());
        return toMe(u, null);
    }

    /** PUT /me/avatar (v2.1): creator photo, brand logo or admin avatar. Creators cannot remove their photo. */
    @Transactional
    public MeDto setAvatar(Long userId, String url) {
        User u = get(userId);
        Instant now = clock.instant();
        switch (u.getRole()) {
            case CREATOR -> {
                if (url == null) throw ApiException.field(HttpStatus.UNPROCESSABLE_CONTENT, "Your profile needs a photo. Choose a new one instead.", "VALIDATION_FAILED", "url", "Your profile needs a photo.");
                creators.findByUserId(u.getId()).ifPresent(c -> {
                    c.setPhotoUrl(url);
                    c.setUpdatedAt(now);
                });
            }
            case BRAND -> brands.findByUserId(u.getId()).ifPresent(b -> {
                b.setLogoUrl(url);
                b.setUpdatedAt(now);
            });
            case ADMIN -> u.setAvatarUrl(url);
        }
        u.setUpdatedAt(now);
        return toMe(u, null);
    }
}
