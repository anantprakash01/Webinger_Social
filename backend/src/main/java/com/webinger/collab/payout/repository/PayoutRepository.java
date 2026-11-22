package com.webinger.collab.payout.repository;

import com.webinger.collab.payout.domain.Payout;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PayoutRepository extends JpaRepository<Payout, Long> {
    List<Payout> findByCreatorUserIdOrderByCreatedAtDescIdDesc(Long creatorUserId);

    Optional<Payout> findByPublicId(String publicId);

    List<Payout> findByStatusAndArrivalDateLessThanEqual(String status, Instant at);
}
