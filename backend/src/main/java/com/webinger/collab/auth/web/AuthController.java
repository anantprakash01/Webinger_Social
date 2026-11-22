package com.webinger.collab.auth.web;

import com.webinger.collab.auth.service.AuthService;
import com.webinger.collab.auth.service.SessionService;
import com.webinger.collab.auth.web.AuthDtos.AuthSessionDto;
import com.webinger.collab.auth.web.AuthDtos.ForgotPasswordRequest;
import com.webinger.collab.auth.web.AuthDtos.GoogleAuthRequest;
import com.webinger.collab.auth.web.AuthDtos.LoginRequest;
import com.webinger.collab.auth.web.AuthDtos.RegisterRequest;
import com.webinger.collab.auth.web.AuthDtos.ResetPasswordRequest;
import com.webinger.collab.auth.web.AuthDtos.VerifyEmailRequest;
import com.webinger.collab.common.AppProperties;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.service.UserService;
import com.webinger.collab.user.web.MeDto;
import jakarta.validation.Valid;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * /auth/* (contract tag Auth). The refresh token never appears in a body: it is set as an httpOnly cookie
 * limited to /api/v1/auth (CLAUDE.md §2, convention 10).
 */
@RestController
@RequestMapping("/auth")
public class AuthController {
    public static final String REFRESH_COOKIE = "wc_refresh";
    private static final String COOKIE_PATH = "/api/v1/auth";

    private final AuthService auth;
    private final SessionService sessions;
    private final UserService users;
    private final AppProperties props;

    public AuthController(AuthService auth, SessionService sessions, UserService users, AppProperties props) {
        this.auth = auth;
        this.sessions = sessions;
        this.users = users;
        this.props = props;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthSessionDto> register(@Valid @RequestBody RegisterRequest body) {
        return signedIn(HttpStatus.CREATED, auth.register(body));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthSessionDto> login(@Valid @RequestBody LoginRequest body) {
        return signedIn(HttpStatus.OK, auth.login(body));
    }

    @PostMapping("/oauth/google")
    public ResponseEntity<AuthSessionDto> google(@Valid @RequestBody GoogleAuthRequest body) {
        AuthService.GoogleResult r = auth.google(body);
        return signedIn(r.created() ? HttpStatus.CREATED : HttpStatus.OK, r.session());
    }

    /** Rotates the refresh cookie; any failure clears it (like the mock). */
    @PostMapping("/refresh")
    public ResponseEntity<AuthSessionDto> refresh(@CookieValue(name = REFRESH_COOKIE, required = false) String cookie) {
        try {
            return signedIn(HttpStatus.OK, sessions.rotate(cookie));
        } catch (ApiException e) {
            throw new CookieClearingException(e);
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = REFRESH_COOKIE, required = false) String cookie, @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        String bearer = authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7).trim() : null;
        sessions.logout(cookie, bearer);
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, clearCookie().toString()).build();
    }

    @PostMapping("/verify-email")
    public MeDto verifyEmail(@Valid @RequestBody VerifyEmailRequest body) {
        return auth.verifyEmail(body.token());
    }

    @PostMapping("/verify-email/resend")
    public ResponseEntity<Void> resend(@AuthenticationPrincipal AuthUser me) {
        auth.resendVerification(me.userId());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<Void> forgot(@Valid @RequestBody ForgotPasswordRequest body) {
        auth.forgotPassword(body.email());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Void> reset(@Valid @RequestBody ResetPasswordRequest body) {
        auth.resetPassword(body);
        return ResponseEntity.noContent().build();
    }

    /* ---------- cookie ---------- */

    private ResponseEntity<AuthSessionDto> signedIn(HttpStatus status, SessionService.Issued s) {
        AuthSessionDto body = new AuthSessionDto(s.accessToken(), s.expiresInSeconds(), users.toMe(s.user(), null));
        return ResponseEntity.status(status).header(HttpHeaders.SET_COOKIE, cookie(s.refreshToken(), s.refreshTtl()).toString()).body(body);
    }

    private ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(REFRESH_COOKIE, value).httpOnly(true).secure(props.cookieSecure()).sameSite("Lax").path(COOKIE_PATH).maxAge(maxAge).build();
    }

    ResponseCookie clearCookie() {
        return cookie("", Duration.ZERO);
    }

    /** A failed refresh answers the problem and clears the cookie. */
    public static class CookieClearingException extends RuntimeException {
        private final ApiException cause;

        CookieClearingException(ApiException cause) {
            super(cause.getMessage(), cause);
            this.cause = cause;
        }

        public ApiException apiException() {
            return cause;
        }
    }
}
