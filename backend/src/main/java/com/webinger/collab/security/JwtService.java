package com.webinger.collab.security;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.webinger.collab.common.AppProperties;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import org.springframework.stereotype.Service;

/** Access tokens (FR-04): HS256 JWT, 15 minutes, subject = user public id, `sid` = session public id. */
@Service
public class JwtService {
    private static final String ISSUER = "webinger-collab";

    public record Claims(String userPublicId, String sessionPublicId) {}

    /** Why a token was refused; maps to the mock's TOKEN_INVALID / TOKEN_EXPIRED. */
    public static final class InvalidToken extends Exception {
        private final boolean expired;

        InvalidToken(boolean expired) {
            this.expired = expired;
        }

        public boolean expired() {
            return expired;
        }
    }

    private final byte[] secret;
    private final Duration ttl;
    private final Clock clock;

    public JwtService(AppProperties props, Clock clock) {
        this.secret = props.jwtSecret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) throw new IllegalStateException("app.jwt-secret (JWT_SECRET) must be at least 32 characters");
        this.ttl = Duration.ofMinutes(props.accessTokenMinutes());
        this.clock = clock;
    }

    public Duration ttl() {
        return ttl;
    }

    public String issue(String userPublicId, String sessionPublicId) {
        Instant now = clock.instant();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .subject(userPublicId)
                .claim("sid", sessionPublicId)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(ttl)))
                .build();
        try {
            SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
            jwt.sign(new MACSigner(secret));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not sign the access token", e);
        }
    }

    public Claims verify(String token) throws InvalidToken {
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(new MACVerifier(secret))) throw new InvalidToken(false);
            JWTClaimsSet c = jwt.getJWTClaimsSet();
            if (!ISSUER.equals(c.getIssuer()) || c.getSubject() == null || c.getStringClaim("sid") == null || c.getExpirationTime() == null) throw new InvalidToken(false);
            if (!clock.instant().isBefore(c.getExpirationTime().toInstant())) throw new InvalidToken(true);
            return new Claims(c.getSubject(), c.getStringClaim("sid"));
        } catch (ParseException | JOSEException e) {
            throw new InvalidToken(false);
        }
    }
}
