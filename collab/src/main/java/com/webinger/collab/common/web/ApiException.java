package com.webinger.collab.common.web;

import java.util.List;
import org.springframework.http.HttpStatus;

/**
 * An answer the API gives on purpose, rendered as RFC 7807 problem+json with a stable `code`
 * (the same codes as the frontend's mock API, e.g. EMAIL_TAKEN, TOKEN_EXPIRED).
 */
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final List<FieldErrorDto> errors;

    public ApiException(HttpStatus status, String detail, String code, List<FieldErrorDto> errors) {
        super(detail);
        this.status = status;
        this.code = code;
        this.errors = errors == null ? List.of() : List.copyOf(errors);
    }

    public ApiException(HttpStatus status, String detail, String code) {
        this(status, detail, code, List.of());
    }

    /** 4xx with one field error, e.g. 409 EMAIL_TAKEN on `email`. */
    public static ApiException field(HttpStatus status, String detail, String code, String field, String message) {
        return new ApiException(status, detail, code, List.of(new FieldErrorDto(field, message)));
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public List<FieldErrorDto> errors() {
        return errors;
    }
}
