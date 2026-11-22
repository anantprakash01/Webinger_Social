package com.webinger.collab.creator.repository;

import com.webinger.collab.creator.domain.PortfolioItem;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PortfolioItemRepository extends JpaRepository<PortfolioItem, Long> {
    List<PortfolioItem> findByCreatorIdOrderBySortOrderAsc(Long creatorId);

    Optional<PortfolioItem> findByPublicIdAndCreatorId(String publicId, Long creatorId);

    long countByCreatorId(Long creatorId);
}
