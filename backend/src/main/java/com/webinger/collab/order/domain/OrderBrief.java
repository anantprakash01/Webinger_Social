package com.webinger.collab.order.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

/** order_briefs (FR-33): what the brand needs. Editable until delivery. */
@Entity
@Table(name = "order_briefs")
@Getter
@Setter
public class OrderBrief {
    /** Same as the order's id. */
    @Id
    @Column(name = "order_id")
    private Long orderId;

    @Column(nullable = false)
    private String requirements;

    @Column(name = "needs_shipping", nullable = false)
    private boolean needsShipping;

    @Column(name = "ship_name")
    private String shipName;

    @Column(name = "ship_line1")
    private String shipLine1;

    @Column(name = "ship_line2")
    private String shipLine2;

    @Column(name = "ship_city")
    private String shipCity;

    @Column(name = "ship_postal_code")
    private String shipPostalCode;

    @Column(name = "ship_country")
    private String shipCountry;

    @ElementCollection
    @CollectionTable(name = "order_brief_links", joinColumns = @JoinColumn(name = "order_id"))
    @OrderColumn(name = "idx")
    @Column(name = "url")
    private List<String> links = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "order_brief_files", joinColumns = @JoinColumn(name = "order_id"))
    @OrderColumn(name = "idx")
    @Column(name = "url")
    private List<String> referenceFiles = new ArrayList<>();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
