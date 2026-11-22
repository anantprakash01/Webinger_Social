package com.webinger.collab.auth.service;

import com.webinger.collab.auth.domain.OneTimeToken;
import com.webinger.collab.auth.repository.OneTimeTokenRepository;
import com.webinger.collab.auth.web.AuthDtos.GoogleAuthRequest;
import com.webinger.collab.auth.web.AuthDtos.LoginRequest;
import com.webinger.collab.auth.web.AuthDtos.RegisterRequest;
import com.webinger.collab.auth.web.AuthDtos.ResetPasswordRequest;
import com.webinger.collab.common.Tokens;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.common.web.FieldErrorDto;
import com.webinger.collab.messaging.MessagingService;
import com.webinger.collab.user.domain.Role;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.service.UserService;
import com.webinger.collab.user.web.MeDto;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Auth module (FR-01 – FR-04): the same rules, status codes, error codes and emails as the frontend's
 * mock (frontend/src/api/mock/handlers/auth.ts).
 */
@Service
public class AuthService {
    static final Duration VERIFY_TTL = Duration.ofHours(24);
    /** FR-03: 30-minute link. */
    static final Duration RESET_TTL = Duration.ofMinutes(30);
    static final int RESEND_LIMIT_PER_HOUR = 5;

    private final UserService users;
    private final SessionService sessions;
    private final OneTimeTokenRepository tokens;
    private final MessagingService messages;
    private final PasswordEncoder passwords;
    private final GoogleIdentityVerifier google;
    private final Clock clock;

    public AuthService(UserService users, SessionService sessions, OneTimeTokenRepository tokens, MessagingService messages, PasswordEncoder passwords, GoogleIdentityVerifier google, Clock clock) {
        this.users = users;
        this.sessions = sessions;
        this.tokens = tokens;
        this.messages = messages;
        this.passwords = passwords;
        this.google = google;
        this.clock = clock;
    }

    /** FR-01: new brand or creator; email to verify (FR-02); signed in straight away. */
    @Transactional
    public SessionService.Issued register(RegisterRequest r) {
        if (users.findByEmail(r.email()).isPresent())
            throw new ApiException(HttpStatus.CONFLICT, "This email already has an account. Sign in instead.", "EMAIL_TAKEN", List.of(new FieldErrorDto("email", "This email already has an account.")));
        // Referral codes (v3.3) are checked once the promos module is ported; until then the code is ignored.
        User u = users.create(r.email(), r.name(), Role.valueOf(r.role()), passwords.encode(r.password()), null, false);
        sendVerification(u);
        return sessions.open(u);
    }

    @Transactional
    public SessionService.Issued login(LoginRequest r) {
        User u = users.findByEmail(r.email()).orElse(null);
        // Same answer for unknown email and wrong password, so the form cannot be used to find accounts.
        if (u == null || u.getPasswordHash() == null || !passwords.matches(r.password(), u.getPasswordHash()))
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.", "INVALID_CREDENTIALS");
        if (u.getStatus() != UserStatus.ACTIVE) throw new ApiException(HttpStatus.FORBIDDEN, "This account is suspended. Contact support.", "ACCOUNT_SUSPENDED");
        return sessions.open(u);
    }

    /** Google sign-in; a new account needs the role (FR-01). Returns whether the account was created. */
    @Transactional
    public GoogleResult google(GoogleAuthRequest r) {
        GoogleIdentityVerifier.GoogleIdentity g = google.verify(r.idToken())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Google sign-in failed. Try again.", "GOOGLE_TOKEN_INVALID"));
        User u = users.findByGoogleSub(g.sub()).or(() -> users.findByEmail(g.email())).orElse(null);
        if (u != null) {
            if (u.getStatus() != UserStatus.ACTIVE) throw new ApiException(HttpStatus.FORBIDDEN, "This account is suspended. Contact support.", "ACCOUNT_SUSPENDED");
            // Link Google to an existing email account; Google has verified the address.
            u.setGoogleSub(g.sub());
            if (u.getEmailVerifiedAt() == null) u.setEmailVerifiedAt(clock.instant());
            return new GoogleResult(sessions.open(u), false);
        }
        if (r.role() == null)
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "There is no account for this Google address yet. Choose Brand or Creator to sign up.", "ROLE_REQUIRED",
                    List.of(new FieldErrorDto("role", "Choose whether you are a brand or a creator.")));
        u = users.create(g.email(), g.name(), Role.valueOf(r.role()), null, g.sub(), true);
        return new GoogleResult(sessions.open(u), true);
    }

    public record GoogleResult(SessionService.Issued session, boolean created) {}

    @Transactional
    public MeDto verifyEmail(String token) {
        User u = consume(token, OneTimeToken.Kind.VERIFY_EMAIL);
        if (u.getEmailVerifiedAt() == null) u.setEmailVerifiedAt(clock.instant());
        u.setUpdatedAt(clock.instant());
        return users.toMe(u, null);
    }

    @Transactional
    public void resendVerification(Long userId) {
        User u = users.get(userId);
        if (u.isEmailVerified()) throw new ApiException(HttpStatus.CONFLICT, "Your email is already verified.", "ALREADY_VERIFIED");
        long recent = tokens.countByUserIdAndKindAndCreatedAtAfter(u.getId(), OneTimeToken.Kind.VERIFY_EMAIL, clock.instant().minus(Duration.ofHours(1)));
        if (recent >= RESEND_LIMIT_PER_HOUR) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many emails sent. Try again in an hour.", "RATE_LIMITED");
        sendVerification(u);
    }

    /** Always succeeds, whether or not the account exists. */
    @Transactional
    public void forgotPassword(String email) {
        users.findByEmail(email).filter(u -> u.getStatus() == UserStatus.ACTIVE).ifPresent(u -> {
            String token = issueToken(u, OneTimeToken.Kind.RESET_PASSWORD);
            messages.email(u.getEmail(), "Reset your password", "Use this link to choose a new password. It works for 30 minutes and only once.", "/reset-password?token=" + token);
        });
    }

    @Transactional
    public void resetPassword(ResetPasswordRequest r) {
        User u = consume(r.token(), OneTimeToken.Kind.RESET_PASSWORD);
        Instant now = clock.instant();
        u.setPasswordHash(passwords.encode(r.password()));
        // The link proves the person controls the inbox.
        if (u.getEmailVerifiedAt() == null) u.setEmailVerifiedAt(now);
        u.setUpdatedAt(now);
        sessions.revokeAll(u.getId());
        messages.email(u.getEmail(), "Your password was changed", "If this was not you, contact support right away.", null);
    }

    /* ---------- one-time links ---------- */

    private void sendVerification(User u) {
        String token = issueToken(u, OneTimeToken.Kind.VERIFY_EMAIL);
        messages.email(u.getEmail(), "Confirm your email address",
                "Hi " + u.getName() + ", confirm your email to start " + (u.getRole() == Role.BRAND ? "booking creators" : "accepting orders") + ". The link works for 24 hours.",
                "/verify-email?token=" + token);
    }

    private String issueToken(User u, OneTimeToken.Kind kind) {
        Instant now = clock.instant();
        // A new link replaces older unused links of the same kind.
        tokens.retireUnused(u.getId(), kind, now);
        String raw = Tokens.random(24);
        OneTimeToken t = new OneTimeToken();
        t.setUserId(u.getId());
        t.setKind(kind);
        t.setTokenHash(Tokens.sha256(raw));
        t.setCreatedAt(now);
        t.setExpiresAt(now.plus(kind == OneTimeToken.Kind.VERIFY_EMAIL ? VERIFY_TTL : RESET_TTL));
        tokens.save(t);
        return raw;
    }

    private User consume(String raw, OneTimeToken.Kind kind) {
        String what = kind == OneTimeToken.Kind.VERIFY_EMAIL ? "verification" : "reset";
        OneTimeToken t = tokens.findByTokenHashAndKind(Tokens.sha256(raw), kind).orElse(null);
        if (t == null || t.getUsedAt() != null)
            throw ApiException.field(HttpStatus.UNPROCESSABLE_CONTENT, "This " + what + " link is no longer valid. Ask for a new one.", "TOKEN_INVALID", "token", "Invalid link");
        Instant now = clock.instant();
        if (!now.isBefore(t.getExpiresAt()))
            throw ApiException.field(HttpStatus.UNPROCESSABLE_CONTENT, "This " + what + " link has expired. Ask for a new one.", "TOKEN_EXPIRED", "token", "Expired link");
        t.setUsedAt(now);
        return users.get(t.getUserId());
    }
}
