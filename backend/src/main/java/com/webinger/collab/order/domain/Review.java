package com.webinger.collab.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** reviews (FR-38): the brand rates a completed order once; the creator replies once. */
@Entity
@Table(name = "reviews")
@Getter
@Setter
public class Review {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "order_id", nullable = false, updatable = false)
    private Long orderId;

    @Column(name = "creator_user_id", nullable = false, updatable = false)
    private Long creatorUserId;

    @Column(name = "brand_user_id", nullable = false, updatable = false)
    private Long brandUserId;

    /** The brand's company name when the review was written. */
    @Column(name = "brand_name", nullable = false, updatable = false)
    private String brandName;

    @Column(nullable = false, updatable = false)
    private int rating;

    @Column(updatable = false)
    private String comment;

    @Column(name = "creator_reply")
    private String creatorReply;

    @Column(name = "replied_at")
    private Instant repliedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
