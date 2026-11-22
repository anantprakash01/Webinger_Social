package com.webinger.collab.common.web;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.regex.Pattern;

/**
 * Field rules shared with the frontend's Zod schemas (features/auth/schemas.ts), with the same messages.
 * Each rule reports exactly one message, in the same order Zod checks, so the form shows the same text.
 */
public final class Rules {
    private Rules() {}

    private static boolean fail(ConstraintValidatorContext ctx, String message) {
        ctx.disableDefaultConstraintViolation();
        ctx.buildConstraintViolationWithTemplate(message).addConstraintViolation();
        return false;
    }

    // ---------- Email: trimmed and lower-cased by the request record ----------

    @Target({ElementType.FIELD, ElementType.RECORD_COMPONENT, ElementType.PARAMETER})
    @Retention(RetentionPolicy.RUNTIME)
    @Constraint(validatedBy = EmailValidator.class)
    public @interface ValidEmail {
        String message() default "Enter a valid email address.";
        Class<?>[] groups() default {};
        Class<? extends Payload>[] payload() default {};
    }

    private static final Pattern EMAIL = Pattern.compile("^[A-Za-z0-9._%+'-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$");

    public static class EmailValidator implements ConstraintValidator<ValidEmail, String> {
        @Override
        public boolean isValid(String v, ConstraintValidatorContext ctx) {
            if (v == null || v.isEmpty()) return fail(ctx, "Enter your email address.");
            if (v.length() > 254) return fail(ctx, "That email is too long.");
            if (!EMAIL.matcher(v).matches()) return fail(ctx, "Enter a valid email address.");
            return true;
        }
    }

    // ---------- Password: 8–128 characters with a letter and a number ----------

    @Target({ElementType.FIELD, ElementType.RECORD_COMPONENT, ElementType.PARAMETER})
    @Retention(RetentionPolicy.RUNTIME)
    @Constraint(validatedBy = PasswordValidator.class)
    public @interface ValidPassword {
        String message() default "Use at least 8 characters.";
        Class<?>[] groups() default {};
        Class<? extends Payload>[] payload() default {};
    }

    public static class PasswordValidator implements ConstraintValidator<ValidPassword, String> {
        @Override
        public boolean isValid(String v, ConstraintValidatorContext ctx) {
            if (v == null || v.length() < 8) return fail(ctx, "Use at least 8 characters.");
            if (v.length() > 128) return fail(ctx, "Use at most 128 characters.");
            if (!v.chars().anyMatch(Character::isLetter) || !v.chars().anyMatch(Character::isDigit)) return fail(ctx, "Use at least one letter and one number.");
            return true;
        }
    }

    // ---------- Person's name: 2–80 characters after trimming (null allowed when optional) ----------

    @Target({ElementType.FIELD, ElementType.RECORD_COMPONENT, ElementType.PARAMETER})
    @Retention(RetentionPolicy.RUNTIME)
    @Constraint(validatedBy = NameValidator.class)
    public @interface ValidName {
        String message() default "Enter at least 2 characters.";
        boolean optional() default false;
        Class<?>[] groups() default {};
        Class<? extends Payload>[] payload() default {};
    }

    public static class NameValidator implements ConstraintValidator<ValidName, String> {
        private boolean optional;

        @Override
        public void initialize(ValidName a) {
            optional = a.optional();
        }

        @Override
        public boolean isValid(String v, ConstraintValidatorContext ctx) {
            if (v == null) return optional || fail(ctx, "Enter at least 2 characters.");
            if (v.length() < 2) return fail(ctx, "Enter at least 2 characters.");
            if (v.length() > 80) return fail(ctx, "Use at most 80 characters.");
            return true;
        }
    }

    /** Trims, and lower-cases emails, the way the Zod schemas transform input before checking it. */
    public static String trim(String s) {
        return s == null ? null : s.trim();
    }

    public static String email(String s) {
        return s == null ? null : s.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
