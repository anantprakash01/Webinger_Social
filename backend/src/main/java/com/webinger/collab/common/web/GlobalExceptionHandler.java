package com.webinger.collab.common.web;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Every error leaves the API as problem+json, like the mock's `fail()`. */
@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    public static ResponseEntity<ProblemBody> problem(HttpStatus status, String detail, String code, List<FieldErrorDto> errors) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(ProblemBody.of(status, detail, code, errors));
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemBody> api(ApiException e) {
        return problem(e.status(), e.getMessage(), e.code(), e.errors());
    }

    /** Bean Validation → 422 with the first message per field, like the mock's toFieldErrors. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemBody> invalid(MethodArgumentNotValidException e) {
        Map<String, String> byField = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> byField.putIfAbsent(f.getField(), f.getDefaultMessage()));
        e.getBindingResult().getGlobalErrors().forEach(g -> byField.putIfAbsent("body", g.getDefaultMessage()));
        List<FieldErrorDto> errors = byField.entrySet().stream().map(x -> new FieldErrorDto(x.getKey(), x.getValue())).toList();
        return problem(HttpStatus.UNPROCESSABLE_CONTENT, "Some fields need your attention.", "VALIDATION_FAILED", errors);
    }

    /**
     * Unreadable body. A value of the wrong JSON type (text for a number, 1500.5 for whole cents) is reported on
     * its field, like Zod's type errors; broken JSON on `body`.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ProblemBody> unreadable(HttpMessageNotReadableException e) {
        String field = fieldOf(e.getCause());
        FieldErrorDto error = field == null ? new FieldErrorDto("body", "The request body is not valid JSON.") : new FieldErrorDto(field, "Enter a valid value.");
        return problem(HttpStatus.UNPROCESSABLE_CONTENT, "Some fields need your attention.", "VALIDATION_FAILED", List.of(error));
    }

    /** `addons.1.priceCents` from Jackson's path, or null when the JSON itself is broken. */
    private static String fieldOf(Throwable cause) {
        if (!(cause instanceof tools.jackson.databind.DatabindException je) || je.getPath().isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (tools.jackson.core.JacksonException.Reference r : je.getPath()) {
            if (!sb.isEmpty()) sb.append('.');
            sb.append(r.getPropertyName() != null ? r.getPropertyName() : String.valueOf(r.getIndex()));
        }
        return sb.toString();
    }

    /** A missing or malformed query parameter, e.g. an upload link without its signature. */
    @ExceptionHandler({org.springframework.web.bind.MissingServletRequestParameterException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    ResponseEntity<ProblemBody> badParameter(Exception e) {
        String name = e instanceof org.springframework.web.bind.MissingServletRequestParameterException m ? m.getParameterName()
                : ((org.springframework.web.method.annotation.MethodArgumentTypeMismatchException) e).getName();
        return problem(HttpStatus.UNPROCESSABLE_CONTENT, "Some fields need your attention.", "VALIDATION_FAILED", List.of(new FieldErrorDto(name, "Enter a valid value.")));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ProblemBody> method(HttpRequestMethodNotSupportedException e) {
        return problem(HttpStatus.METHOD_NOT_ALLOWED, e.getMethod() + " is not supported here.", null, null);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ProblemBody> notFound(NoResourceFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "No endpoint " + e.getHttpMethod() + " /" + e.getResourcePath() + ".", null, null);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemBody> unexpected(Exception e) {
        log.error("Unhandled error", e);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong on our side.", null, null);
    }
}
