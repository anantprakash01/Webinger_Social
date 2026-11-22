package com.webinger.collab.creator.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

/** packages (FR-12, FR-13): a priced offer on one platform. Price in paise (`priceCents`). */
@Entity
@Table(name = "packages")
@Getter
@Setter
public class CreatorPackage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "creator_id", nullable = false, updatable = false)
    private Long creatorId;

    @Column(nullable = false)
    private String platform;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String description;

    @ElementCollection
    @CollectionTable(name = "package_deliverables", joinColumns = @JoinColumn(name = "package_id"))
    @OrderColumn(name = "idx")
    @Column(name = "deliverable")
    @BatchSize(size = 100)
    private List<String> deliverables = new ArrayList<>();

    @Column(name = "price_cents", nullable = false)
    private long priceCents;

    @Column(nullable = false)
    private String currency = "INR";

    @Column(name = "delivery_days", nullable = false)
    private int deliveryDays;

    @Column(nullable = false)
    private boolean active = true;

    @ElementCollection
    @CollectionTable(name = "package_addons", joinColumns = @JoinColumn(name = "package_id"))
    @OrderColumn(name = "idx")
    @BatchSize(size = 100)
    private List<Addon> addons = new ArrayList<>();

    @Version
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** v2.4 add-on: paid ad usage rights, rush delivery or an extra revision. One of each kind. */
    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Addon {
        @Column(name = "addon_id", nullable = false)
        private String addonId;

        @Column(nullable = false)
        private String kind;

        @Column(nullable = false)
        private String title;

        @Column(name = "price_cents", nullable = false)
        private long priceCents;

        @Column(name = "usage_days")
        private Integer usageDays;

        @Column(name = "rush_days")
        private Integer rushDays;
    }
}
