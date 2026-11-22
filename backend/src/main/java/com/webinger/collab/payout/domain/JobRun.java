package com.webinger.collab.payout.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** job_runs: when a scheduled job last ran (the weekly payout runs once per Monday boundary). */
@Entity
@Table(name = "job_runs")
@Getter
@Setter
@NoArgsConstructor
public class JobRun {
    @Id
    private String name;

    @Column(name = "last_run_at", nullable = false)
    private Instant lastRunAt;

    public JobRun(String name, Instant lastRunAt) {
        this.name = name;
        this.lastRunAt = lastRunAt;
    }
}
