package com.webinger.collab.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Stateless API: the access token travels in the Authorization header, so CSRF protection is not needed for
 * it. The refresh cookie is httpOnly, SameSite=Lax and limited to /api/v1/auth, and refresh returns the new
 * token in the body (another site cannot read it). Paths here are relative to the /api/v1 context path.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http, JwtAuthFilter jwtFilter, ProblemAuthenticationEntryPoint problems) throws Exception {
        http.csrf(c -> c.disable())
                .cors(c -> {})
                .httpBasic(b -> b.disable())
                .formLogin(f -> f.disable())
                .logout(l -> l.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e.authenticationEntryPoint(problems).accessDeniedHandler(problems))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.POST, "/auth/verify-email/resend").authenticated()
                        .requestMatchers("/auth/**").permitAll()
                        .requestMatchers("/dev/**").permitAll() // only registered in demo mode (DevController)
                        // Public discovery (FR-15, FR-20): the workspace under /creators/me stays signed-in only.
                        .requestMatchers("/creators/me", "/creators/me/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/creators", "/creators/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/fees").permitAll()
                        // Stand-ins for S3: the upload URL is signed, uploaded files are public (like CloudFront).
                        .requestMatchers(HttpMethod.PUT, "/files/uploads/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/files/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** The JWT filter runs inside the security chain only, not a second time as a plain servlet filter. */
    @Bean
    org.springframework.boot.web.servlet.FilterRegistrationBean<JwtAuthFilter> jwtFilterRegistration(JwtAuthFilter f) {
        var r = new org.springframework.boot.web.servlet.FilterRegistrationBean<>(f);
        r.setEnabled(false);
        return r;
    }

    /** BCrypt cost 12 (CLAUDE.md §5). */
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
