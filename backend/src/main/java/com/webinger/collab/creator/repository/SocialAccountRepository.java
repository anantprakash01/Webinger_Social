package com.webinger.collab.creator.repository;

import com.webinger.collab.creator.domain.SocialAccount;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SocialAccountRepository extends JpaRepository<SocialAccount, Long> {
    List<SocialAccount> findByCreatorId(Long creatorId);

    List<SocialAccount> findByCreatorIdIn(Collection<Long> creatorIds);

    Optional<SocialAccount> findByPublicIdAndCreatorId(String publicId, Long creatorId);

    boolean existsByCreatorIdAndPlatform(Long creatorId, String platform);
}
