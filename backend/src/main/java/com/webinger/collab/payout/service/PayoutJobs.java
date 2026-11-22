package com.webinger.collab.payout.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** Weekly payouts and arrivals (FR-63), checked every 5 minutes. Off when `app.jobs-enabled=false`. Add ShedLock before scaling out. */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "app", name = "jobs-enabled", havingValue = "true", matchIfMissing = true)
public class PayoutJobs {
    private static final Logger log = LoggerFactory.getLogger(PayoutJobs.class);
    private final PayoutService payouts;

    public PayoutJobs(PayoutService payouts) {
        this.payouts = payouts;
    }

    @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT45S")
    public void run() {
        int made = payouts.runWeekly();
        if (made > 0) log.info("Weekly payouts sent: {}", made);
    }
}
