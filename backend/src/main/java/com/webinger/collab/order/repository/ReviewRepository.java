package com.webinger.collab.order.repository;

import com.webinger.collab.order.domain.Review;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewRepository extends JpaRepository<Review, Long> {
    Optional<Review> findByOrderId(Long orderId);

    Optional<Review> findByPublicId(String publicId);

    List<Review> findByCreatorUserIdOrderByCreatedAtDesc(Long creatorUserId);

    List<Review> findByCreatorUserIdIn(Collection<Long> creatorUserIds);
}
