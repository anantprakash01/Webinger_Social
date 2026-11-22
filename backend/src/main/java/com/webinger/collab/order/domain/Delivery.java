package com.webinger.collab.order.domain;

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
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

/** deliveries (FR-34): one submission of files or post links; revisionNo 0 is the first. */
@Entity
@Table(name = "deliveries")
@Getter
@Setter
public class Delivery {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "order_id", nullable = false, updatable = false)
    private Long orderId;

    @Column(name = "revision_no", nullable = false, updatable = false)
    private int revisionNo;

    @ElementCollection
    @CollectionTable(name = "delivery_items", joinColumns = @JoinColumn(name = "delivery_id"))
    @OrderColumn(name = "idx")
    @BatchSize(size = 50)
    private List<Item> items = new ArrayList<>();

    private String note;

    @Column(name = "submitted_at", nullable = false, updatable = false)
    private Instant submittedAt;

    /** FILE (an uploaded file) or POST_URL (the live post, https). */
    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Item {
        @Column(nullable = false)
        private String type;

        @Column(nullable = false)
        private String url;

        private String name;
    }
}
