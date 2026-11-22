package com.webinger.collab.auth.web;

import com.webinger.collab.common.web.Rules;
import com.webinger.collab.common.web.Rules.ValidEmail;
import com.webinger.collab.common.web.Rules.ValidName;
import com.webinger.collab.common.web.Rules.ValidPassword;
import com.webinger.collab.user.web.MeDto;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request and response bodies of the Auth module (contract schemas of the same names). */
public final class AuthDtos {
    private AuthDtos() {}

    private static final String ROLE_MESSAGE = "Choose whether you are a brand or a creator.";

    public record RegisterRequest(
            @NotNull(message = ROLE_MESSAGE) @Pattern(regexp = "BRAND|CREATOR", message = ROLE_MESSAGE) String role,
            @ValidName String name,
            @ValidEmail String email,
            @ValidPassword String password,
            @AssertTrue(message = "Accept the terms to create an account.") boolean acceptTerms,
            @Size(max = 20, message = "Referral codes are at most 20 characters.") @Pattern(regexp = "^[A-Za-z0-9]*$", message = "Use letters and numbers only.") String referralCode) {
        public RegisterRequest {
            name = Rules.trim(name);
            email = Rules.email(email);
            referralCode = referralCode == null ? null : referralCode.trim().toUpperCase(java.util.Locale.ROOT);
        }
    }

    public record LoginRequest(@ValidEmail String email, @NotEmpty(message = "Enter your password.") String password) {
        public LoginRequest {
            email = Rules.email(email);
        }
    }

    public record GoogleAuthRequest(
            @NotBlank(message = "Google sign-in failed. Try again.") String idToken,
            @Pattern(regexp = "BRAND|CREATOR", message = ROLE_MESSAGE) String role) {}

    public record VerifyEmailRequest(@NotBlank(message = "The verification link is incomplete.") String token) {}

    public record ForgotPasswordRequest(@ValidEmail String email) {
        public ForgotPasswordRequest {
            email = Rules.email(email);
        }
    }

    public record ResetPasswordRequest(@NotBlank(message = "The reset link is incomplete.") String token, @ValidPassword String password) {}

    /** Contract AuthSession. */
    public record AuthSessionDto(String accessToken, long expiresIn, MeDto user) {}
}
