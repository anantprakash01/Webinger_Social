package com.webinger.collab.user.repository;

import com.webinger.collab.user.domain.User;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);

    Optional<User> findByPublicId(String publicId);

    Optional<User> findByGoogleSub(String googleSub);

    boolean existsByEmail(String email);
}
