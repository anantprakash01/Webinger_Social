package com.webinger.collab.common.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

/** RFC 7807 body (contract Problem): type, title, status, detail, code, errors. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProblemBody(String type, String title, int status, String detail, String code, List<FieldErrorDto> errors) {

    private static final Map<Integer, String> TITLES = Map.ofEntries(
            Map.entry(400, "Bad request"),
            Map.entry(401, "Unauthorized"),
            Map.entry(402, "Payment required"),
            Map.entry(403, "Forbidden"),
            Map.entry(404, "Not found"),
            Map.entry(405, "Method not allowed"),
            Map.entry(409, "Conflict"),
            Map.entry(422, "Validation failed"),
            Map.entry(429, "Too many requests"),
            Map.entry(500, "Internal server error"));

    public static ProblemBody of(HttpStatus status, String detail, String code, List<FieldErrorDto> errors) {
        return new ProblemBody("about:blank", TITLES.getOrDefault(status.value(), status.getReasonPhrase()), status.value(), detail, code,
                errors == null || errors.isEmpty() ? null : errors);
    }
}
