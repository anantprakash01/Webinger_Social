package com.webinger.collab.common.web;

/** One invalid field in an answer (contract FieldError). */
public record FieldErrorDto(String field, String message) {}
