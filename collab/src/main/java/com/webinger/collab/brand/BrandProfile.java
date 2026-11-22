package com.webinger.collab.brand;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** brand_profiles (FR-05). More fields arrive with the brands module. */
@Entity
@Table(name = "brand_profiles")
@Getter
@Setter
public class BrandProfile {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    @Column(name = "company_name")
    private String companyName;

    private String website;

    @Column(name = "logo_url")
    private String logoUrl;

    private String industry;
    private String country;
    private String state;
    private String gstin;

    @Column(nullable = false)
    private String plan = "FREE";

    @Column(name = "razorpay_customer_id")
    private String razorpayCustomerId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
