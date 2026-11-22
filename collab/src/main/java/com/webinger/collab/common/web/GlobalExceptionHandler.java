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

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ProblemBody> unreadable(HttpMessageNotReadableException e) {
        return problem(HttpStatus.UNPROCESSABLE_CONTENT, "Some fields need your attention.", "VALIDATION_FAILED", List.of(new FieldErrorDto("body", "The request body is not valid JSON.")));
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
