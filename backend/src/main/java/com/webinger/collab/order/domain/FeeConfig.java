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

/** fee_configs (FR-66, FR-83): fees per plan; the newest row per plan applies to new orders only. */
@Entity
@Table(name = "fee_configs")
@Getter
@Setter
public class FeeConfig {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String plan;

    @Column(name = "brand_fee_bps", nullable = false)
    private int brandFeeBps;

    @Column(name = "creator_fee_bps", nullable = false)
    private int creatorFeeBps;

    @Column(name = "effective_from", nullable = false)
    private Instant effectiveFrom;

    @Column(name = "changed_by")
    private Long changedBy;
}
