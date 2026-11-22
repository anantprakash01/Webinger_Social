package com.webinger.collab.creator.repository;

import com.webinger.collab.creator.domain.SavedList;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedListRepository extends JpaRepository<SavedList, Long> {
    List<SavedList> findByBrandUserIdOrderByCreatedAtDesc(Long brandUserId);

    Optional<SavedList> findByPublicIdAndBrandUserId(String publicId, Long brandUserId);

    long countByBrandUserId(Long brandUserId);
}
