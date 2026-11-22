package com.webinger.collab.payout.repository;

import com.webinger.collab.payout.domain.JobRun;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobRunRepository extends JpaRepository<JobRun, String> {}
