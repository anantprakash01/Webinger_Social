package com.webinger.collab.payment.service;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * `app.razorpay.*`: the publishable key id shown to Checkout and the secret that signs Checkout's proof
 * (HMAC-SHA256 of "razorpay_order_id|razorpay_payment_id"). The secret comes from the environment.
 */
@ConfigurationProperties(prefix = "app.razorpay")
public record RazorpayProperties(String keyId, String keySecret) {}
