package com.webinger.collab.security;

import com.webinger.collab.auth.domain.AuthSession;
import com.webinger.collab.auth.repository.AuthSessionRepository;
import com.webinger.collab.auth.service.SessionService;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Resolves `Authorization: Bearer <jwt>` to the caller, like the mock's `authenticate()`: the token must
 * verify, its session must not be revoked, and the account must be active. When it fails, the reason is
 * left for {@link ProblemAuthenticationEntryPoint}, so public endpoints still work with a stale token.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    public static final String AUTH_ERROR = "collab.authError";

    /** Why the bearer token was refused (status 401, mock codes). */
    public record AuthError(String code, String detail) {}

    private final JwtService jwt;
    private final AuthSessionRepository sessions;
    private final UserRepository users;
    private final SessionService sessionService;
    private final ProblemAuthenticationEntryPoint problems;

    public JwtAuthFilter(JwtService jwt, AuthSessionRepository sessions, UserRepository users, SessionService sessionService, ProblemAuthenticationEntryPoint problems) {
        this.jwt = jwt;
        this.sessions = sessions;
        this.users = users;
        this.sessionService = sessionService;
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                AuthUser me = authenticate(header.substring(7).trim());
                // FR-82: impersonation is read-only. Signing out is the one write it may do.
                if (me.impersonated() && !"GET".equals(req.getMethod()) && !req.getRequestURI().endsWith("/auth/logout")) {
                    problems.write(res, org.springframework.http.HttpStatus.FORBIDDEN, "This is a read-only view. Stop viewing as this user to make changes.", "READ_ONLY_IMPERSONATION");
                    return;
                }
            } catch (Refused r) {
                req.setAttribute(AUTH_ERROR, r.error);
            }
        }
        chain.doFilter(req, res);
    }

    private static final class Refused extends Exception {
        final AuthError error;

        Refused(String code, String detail) {
            super(detail, null, false, false);
            this.error = new AuthError(code, detail);
        }
    }

    private AuthUser authenticate(String token) throws Refused {
        JwtService.Claims claims;
        try {
            claims = jwt.verify(token);
        } catch (JwtService.InvalidToken e) {
            if (e.expired()) throw new Refused("TOKEN_EXPIRED", "Your session expired.");
            throw new Refused("TOKEN_INVALID", "Your session has ended. Please sign in again.");
        }
        Optional<AuthSession> session = sessions.findByPublicId(claims.sessionPublicId());
        Optional<User> user = users.findByPublicId(claims.userPublicId());
        if (session.isEmpty() || session.get().isRevoked() || user.isEmpty() || !session.get().getUserId().equals(user.get().getId()))
            throw new Refused("TOKEN_INVALID", "Your session has ended. Please sign in again.");
        User u = user.get();
        if (u.getStatus() != UserStatus.ACTIVE) {
            sessionService.revokeAll(u.getId());
            throw new Refused("ACCOUNT_SUSPENDED", u.getStatus() == UserStatus.BANNED ? "This account has been closed." : "This account is suspended. Contact support.");
        }
        String impersonator = session.get().getImpersonatorId() == null ? null : users.findById(session.get().getImpersonatorId()).map(User::getName).orElse("Admin");
        AuthUser principal = new AuthUser(u.getId(), u.getPublicId(), u.getRole(), session.get().getId(), impersonator);
        var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + u.getRole().name())));
        SecurityContextHolder.getContext().setAuthentication(auth);
        return principal;
    }
}
