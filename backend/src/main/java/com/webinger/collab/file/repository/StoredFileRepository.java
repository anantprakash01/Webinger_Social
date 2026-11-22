package com.webinger.collab.file.repository;

import com.webinger.collab.file.domain.StoredFile;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoredFileRepository extends JpaRepository<StoredFile, Long> {
    Optional<StoredFile> findByStorageKey(String storageKey);
}
