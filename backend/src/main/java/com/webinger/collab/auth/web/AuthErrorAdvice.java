package com.webinger.collab.auth.web;

import com.webinger.collab.common.AppProperties;
import com.webinger.collab.common.web.GlobalExceptionHandler;
import com.webinger.collab.common.web.ProblemBody;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** A refused refresh: problem+json and an expired refresh cookie. */
@org.springframework.core.annotation.Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = AuthController.class)
public class AuthErrorAdvice {
    private final AppProperties props;

    public AuthErrorAdvice(AppProperties props) {
        this.props = props;
    }

    @ExceptionHandler(AuthController.CookieClearingException.class)
    ResponseEntity<ProblemBody> refreshRefused(AuthController.CookieClearingException e) {
        var api = e.apiException();
        ResponseCookie clear = ResponseCookie.from(AuthController.REFRESH_COOKIE, "").httpOnly(true).secure(props.cookieSecure()).sameSite("Lax").path("/api/v1/auth").maxAge(0).build();
        ResponseEntity<ProblemBody> p = GlobalExceptionHandler.problem(api.status(), api.getMessage(), api.code(), api.errors());
        return ResponseEntity.status(p.getStatusCode()).headers(p.getHeaders()).header(HttpHeaders.SET_COOKIE, clear.toString()).body(p.getBody());
    }
}
