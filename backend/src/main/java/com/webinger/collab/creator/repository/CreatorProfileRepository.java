package com.webinger.collab.creator.repository;

import com.webinger.collab.creator.domain.CreatorProfile;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CreatorProfileRepository extends JpaRepository<CreatorProfile, Long> {
    Optional<CreatorProfile> findByUserId(Long userId);

    List<CreatorProfile> findByUserIdIn(Collection<Long> userIds);

    /** Usernames are stored lower case. */
    Optional<CreatorProfile> findByUsername(String username);

    boolean existsByUsernameAndUserIdNot(String username, Long userId);

    List<CreatorProfile> findByVettingStatusOrderBySubmittedAtAscCreatedAtAsc(String vettingStatus);

    long countByVettingStatus(String vettingStatus);

    /** Creators whose balance goes out with the Monday payout. */
    List<CreatorProfile> findByPayoutStatusAndAutoWeeklyTrue(String payoutStatus);

    /** FR-70 profile views, counted in SQL so concurrent views never collide with profile edits. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update CreatorProfile p set p.profileViews = p.profileViews + 1 where p.id = :id")
    int incrementViews(@Param("id") Long id);

    /**
     * Approved creators of active accounts, narrowed by the filters SQL can apply cheaply (FR-21).
     * Null parameters mean "any". Keyword relevance, platform reach and starting price are computed
     * in {@code CreatorSearchService}.
     */
    @Query("""
            select p from CreatorProfile p
            where p.vettingStatus = 'APPROVED' and p.username is not null
              and p.userId in (select u.id from User u where u.status = com.webinger.collab.user.domain.UserStatus.ACTIVE)
              and (:country is null or p.country = :country)
              and (:city is null or lower(p.city) = :city)
              and (:gender is null or p.gender = :gender)
              and (:bornFrom is null or p.birthYear >= :bornFrom)
              and (:bornTo is null or p.birthYear <= :bornTo)
              and (:niche is null or :niche member of p.niches)
              and (:language is null or :language member of p.languages)
            """)
    List<CreatorProfile> searchCandidates(@Param("country") String country, @Param("city") String city, @Param("gender") String gender,
            @Param("bornFrom") Integer bornFrom, @Param("bornTo") Integer bornTo, @Param("niche") String niche, @Param("language") String language);
}
