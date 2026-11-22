-- Payouts (Phase 1, Weeks 12–15, module 2): FR-62, FR-63. Mirrors the mock's payoutsCore.ts and handlers/payouts.ts.
-- Money leaves a creator's balance as a RazorpayX payout: weekly on Mondays, or on request (standard or instant).

-- Weekly payout on or off (the creator's setting; on by default).
ALTER TABLE creator_profiles ADD COLUMN auto_weekly BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE payouts (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id          VARCHAR(40)  NOT NULL,
  creator_user_id    BIGINT       NOT NULL,
  amount_cents       BIGINT       NOT NULL,
  fee_cents          BIGINT       NOT NULL DEFAULT 0,
  speed              VARCHAR(10)  NOT NULL,
  destination_label  VARCHAR(300) NOT NULL,
  status             VARCHAR(12)  NOT NULL,
  failure_reason     VARCHAR(300),
  razorpay_payout_id VARCHAR(40),
  created_at         DATETIME(6)  NOT NULL,
  arrival_date       DATETIME(6)  NOT NULL,
  CONSTRAINT uq_payouts_public_id UNIQUE (public_id),
  CONSTRAINT fk_payouts_creator FOREIGN KEY (creator_user_id) REFERENCES users (id)
);
CREATE INDEX ix_payouts_creator ON payouts (creator_user_id, created_at);
CREATE INDEX ix_payouts_status ON payouts (status, arrival_date);

-- When each scheduled job last ran (the weekly payout runs once per Monday boundary).
CREATE TABLE job_runs (
  name        VARCHAR(40) NOT NULL PRIMARY KEY,
  last_run_at DATETIME(6) NOT NULL
);
