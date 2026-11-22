package com.webinger.collab.creator.repository;

import com.webinger.collab.creator.domain.CreatorPackage;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PackageRepository extends JpaRepository<CreatorPackage, Long> {
    List<CreatorPackage> findByCreatorId(Long creatorId);

    List<CreatorPackage> findByCreatorIdInAndActiveTrue(Collection<Long> creatorIds);

    Optional<CreatorPackage> findByPublicIdAndCreatorId(String publicId, Long creatorId);

    Optional<CreatorPackage> findByPublicId(String publicId);

    long countByCreatorIdAndActiveTrue(Long creatorId);
}
