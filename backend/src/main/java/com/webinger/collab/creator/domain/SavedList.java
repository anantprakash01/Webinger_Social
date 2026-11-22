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
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

/** saved_lists (FR-25): a brand's named shortlist of creators, newest addition first. */
@Entity
@Table(name = "saved_lists")
@Getter
@Setter
public class SavedList {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "brand_user_id", nullable = false, updatable = false)
    private Long brandUserId;

    @Column(nullable = false)
    private String name;

    @ElementCollection
    @CollectionTable(name = "saved_list_creators", joinColumns = @JoinColumn(name = "list_id"))
    @BatchSize(size = 50)
    private List<Entry> entries = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Entry {
        @Column(name = "creator_id", nullable = false)
        private Long creatorId;

        @Column(name = "added_at", nullable = false)
        private Instant addedAt;
    }
}
