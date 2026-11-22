package com.webinger.collab.auth.service;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import com.webinger.collab.common.AppProperties;
import java.net.MalformedURLException;
import java.net.URI;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Checks a Google ID token from "Continue with Google": signature against Google's keys, issuer, audience
 * (our client id), expiry and a verified email. In demo mode it also accepts the frontend mock's
 * `mock-google:<sub>:<email>:<name>` token, so the demo button works against this API.
 */
@Component
public class GoogleIdentityVerifier {
    public record GoogleIdentity(String sub, String email, String name) {}

    private static final Pattern MOCK = Pattern.compile("^mock-google:([^:]+):([^:]+):(.+)$");

    private final AppProperties props;
    private volatile DefaultJWTProcessor<SecurityContext> processor;

    public GoogleIdentityVerifier(AppProperties props) {
        this.props = props;
    }

    public Optional<GoogleIdentity> verify(String idToken) {
        if (props.demo()) {
            Matcher m = MOCK.matcher(idToken);
            if (m.matches()) return Optional.of(new GoogleIdentity(m.group(1), m.group(2).toLowerCase(java.util.Locale.ROOT), m.group(3)));
        }
        if (props.googleClientId() == null || props.googleClientId().isBlank()) return Optional.empty();
        try {
            JWTClaimsSet c = processor().process(idToken, null);
            if (!Boolean.TRUE.equals(c.getBooleanClaim("email_verified"))) return Optional.empty();
            String email = c.getStringClaim("email");
            String name = Optional.ofNullable(c.getStringClaim("name")).orElse(email);
            return Optional.of(new GoogleIdentity(c.getSubject(), email.toLowerCase(java.util.Locale.ROOT), name));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private DefaultJWTProcessor<SecurityContext> processor() throws MalformedURLException {
        if (processor == null) {
            synchronized (this) {
                if (processor == null) {
                    JWKSource<SecurityContext> keys = JWKSourceBuilder.create(URI.create("https://www.googleapis.com/oauth2/v3/certs").toURL()).retrying(true).build();
                    DefaultJWTProcessor<SecurityContext> p = new DefaultJWTProcessor<>();
                    p.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, keys));
                    p.setJWTClaimsSetVerifier(new DefaultJWTClaimsVerifier<>(props.googleClientId(), null, Set.of("sub", "email", "exp", "iss")) {
                        @Override
                        public void verify(JWTClaimsSet claims, SecurityContext ctx) throws com.nimbusds.jwt.proc.BadJWTException {
                            super.verify(claims, ctx);
                            String iss = claims.getIssuer();
                            if (!"accounts.google.com".equals(iss) && !"https://accounts.google.com".equals(iss)) throw new com.nimbusds.jwt.proc.BadJWTException("Bad issuer");
                        }
                    });
                    processor = p;
                }
            }
        }
        return processor;
    }
}
