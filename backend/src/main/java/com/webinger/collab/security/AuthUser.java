package com.webinger.collab.security;

import com.webinger.collab.user.domain.Role;

/**
 * The signed-in caller, from the access token. `impersonatorName` is set in a read-only admin view
 * (FR-82). Controllers take it with {@code @AuthenticationPrincipal AuthUser me}.
 */
public record AuthUser(Long userId, String publicId, Role role, Long sessionId, String impersonatorName) {
    public boolean impersonated() {
        return impersonatorName != null;
    }
}
