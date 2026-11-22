package com.webinger.collab.security;

import com.webinger.collab.common.web.ProblemBody;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** 401 / 403 as problem+json with the mock's codes (NOT_AUTHENTICATED, TOKEN_EXPIRED, ROLE_NOT_ALLOWED…). */
@Component
public class ProblemAuthenticationEntryPoint implements AuthenticationEntryPoint, AccessDeniedHandler {
    private final ObjectMapper json;

    public ProblemAuthenticationEntryPoint(ObjectMapper json) {
        this.json = json;
    }

    @Override
    public void commence(HttpServletRequest req, HttpServletResponse res, AuthenticationException e) throws IOException {
        Object err = req.getAttribute(JwtAuthFilter.AUTH_ERROR);
        if (err instanceof JwtAuthFilter.AuthError a) write(res, HttpStatus.UNAUTHORIZED, a.detail(), a.code());
        else write(res, HttpStatus.UNAUTHORIZED, "Please sign in.", "NOT_AUTHENTICATED");
    }

    @Override
    public void handle(HttpServletRequest req, HttpServletResponse res, AccessDeniedException e) throws IOException {
        write(res, HttpStatus.FORBIDDEN, "You don't have access to this.", "ROLE_NOT_ALLOWED");
    }

    public void write(HttpServletResponse res, HttpStatus status, String detail, String code) throws IOException {
        res.setStatus(status.value());
        res.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        res.setCharacterEncoding("UTF-8");
        json.writeValue(res.getOutputStream(), ProblemBody.of(status, detail, code, null));
    }
}
