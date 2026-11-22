package com.webinger.collab.auth.service;

import com.webinger.collab.auth.domain.AuthSession;
import com.webinger.collab.auth.domain.RefreshToken;
import com.webinger.collab.auth.repository.AuthSessionRepository;
import com.webinger.collab.auth.repository.RefreshTokenRepository;
import com.webinger.collab.common.AppProperties;
import com.webinger.collab.common.Tokens;
import com.webinger.collab.common.Ulid;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.security.JwtService;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.repository.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sign-in sessions (FR-04): access token 15 min + rotating refresh token 7 days in an httpOnly cookie.
 * Reusing a rotated refresh token revokes its whole family (someone may have stolen it), like the mock.
 */
@Service
public class SessionService {
    /** What a sign-in or refresh hands back: the JWT for the body and the raw refresh token for the cookie. */
    public record Issued(User user, String accessToken, long expiresInSeconds, String refreshToken, Duration refreshTtl) {}

    private final AuthSessionRepository sessions;
    private final RefreshTokenRepository refreshTokens;
    private final UserRepository users;
    private final JwtService jwt;
    private final Clock clock;
    private final Duration refreshTtl;

    public SessionService(AuthSessionRepository sessions, RefreshTokenRepository refreshTokens, UserRepository users, JwtService jwt, Clock clock, AppProperties props) {
        this.sessions = sessions;
        this.refreshTokens = refreshTokens;
        this.users = users;
        this.jwt = jwt;
        this.clock = clock;
        this.refreshTtl = Duration.ofDays(props.refreshTokenDays());
    }

    /** New sign-in: a new session (refresh family). */
    @Transactional
    public Issued open(User user) {
        Instant now = clock.instant();
        AuthSession s = new AuthSession();
        s.setPublicId(Ulid.next(now.toEpochMilli()));
        s.setUserId(user.getId());
        s.setCreatedAt(now);
        s.setLastUsedAt(now);
        sessions.save(s);
        return issue(user, s, now);
    }

    /** Refresh: rotate the token in the same family. */
    @Transactional(noRollbackFor = ApiException.class)
    public Issued rotate(String rawRefresh) {
        if (rawRefresh == null || rawRefresh.isBlank()) throw unauthorized("Please sign in.", "NOT_AUTHENTICATED");
        RefreshToken row = refreshTokens.findByTokenHash(Tokens.sha256(rawRefresh)).orElseThrow(() -> unauthorized("Please sign in.", "NOT_AUTHENTICATED"));
        Instant now = clock.instant();
        AuthSession session = sessions.findById(row.getSessionId()).orElseThrow(() -> unauthorized("Please sign in.", "NOT_AUTHENTICATED"));
        if (row.getRevokedAt() != null) {
            // Reuse of a rotated token: end every session in that family.
            revokeSession(session, now);
            throw unauthorized("Your session has ended. Please sign in again.", "REFRESH_REUSED");
        }
        if (!now.isBefore(row.getExpiresAt())) throw unauthorized("Your session expired. Please sign in again.", "REFRESH_EXPIRED");
        if (session.isRevoked()) throw unauthorized("Your session has ended. Please sign in again.", "REFRESH_REUSED");
        User user = users.findById(row.getUserId()).orElseThrow(() -> unauthorized("Please sign in.", "NOT_AUTHENTICATED"));
        if (user.getStatus() != UserStatus.ACTIVE) {
            revokeAll(user.getId());
            throw unauthorized(user.getStatus() == UserStatus.BANNED ? "This account has been closed." : "This account is suspended. Contact support.", "ACCOUNT_SUSPENDED");
        }
        row.setRevokedAt(now);
        session.setLastUsedAt(now);
        return issue(user, session, now);
    }

    /** Sign out: revoke the session of the refresh cookie and of the access token, if given. Never fails. */
    @Transactional
    public void logout(String rawRefresh, String accessToken) {
        Instant now = clock.instant();
        if (rawRefresh != null && !rawRefresh.isBlank())
            refreshTokens.findByTokenHash(Tokens.sha256(rawRefresh)).flatMap(r -> sessions.findById(r.getSessionId())).ifPresent(s -> revokeSession(s, now));
        if (accessToken != null) {
            try {
                JwtService.Claims c = jwt.verify(accessToken);
                sessions.findByPublicId(c.sessionPublicId()).ifPresent(s -> revokeSession(s, now));
            } catch (JwtService.InvalidToken ignored) {
                // An expired or bad token needs nothing revoked.
            }
        }
    }

    /** Every session of the user (password reset, suspension, refresh-token reuse). */
    @Transactional
    public void revokeAll(Long userId) {
        Instant now = clock.instant();
        sessions.revokeAll(userId, now);
        refreshTokens.revokeUser(userId, now);
    }

    /** Every session except the caller's (v2.2 "sign out other devices"). Returns how many ended. */
    @Transactional
    public int revokeOthers(Long userId, Long keepSessionId) {
        Instant now = clock.instant();
        int n = sessions.revokeAllExcept(userId, keepSessionId, now);
        refreshTokens.revokeUserExcept(userId, keepSessionId, now);
        return n;
    }

    private void revokeSession(AuthSession s, Instant now) {
        if (s.getRevokedAt() == null) s.setRevokedAt(now);
        refreshTokens.revokeSession(s.getId(), now);
    }

    private Issued issue(User user, AuthSession session, Instant now) {
        String raw = Tokens.random(32);
        RefreshToken rt = new RefreshToken();
        rt.setSessionId(session.getId());
        rt.setUserId(user.getId());
        rt.setTokenHash(Tokens.sha256(raw));
        rt.setCreatedAt(now);
        rt.setExpiresAt(now.plus(refreshTtl));
        refreshTokens.save(rt);
        user.setLastActiveAt(now);
        // save() also re-attaches a user detached by an earlier bulk update in the same transaction.
        user = users.save(user);
        return new Issued(user, jwt.issue(user.getPublicId(), session.getPublicId()), jwt.ttl().toSeconds(), raw, refreshTtl);
    }

    private static ApiException unauthorized(String detail, String code) {
        return new ApiException(HttpStatus.UNAUTHORIZED, detail, code);
    }
}
