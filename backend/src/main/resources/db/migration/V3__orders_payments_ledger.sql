-- Orders, payments and the ledger (Phase 1, Weeks 12–15, first module): FR-30 – FR-38, FR-60, FR-64.
-- Mirrors the frontend mock (orderMachine.ts, ledger.ts, handlers/orders.ts, handlers/payments.ts).
-- Money is BIGINT paise; fees, taxes and discounts are copied onto the order at checkout.

-- ---------- Fees per plan (FR-66, FR-83): the newest row per plan applies to new orders ----------
CREATE TABLE fee_configs (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  plan            VARCHAR(10) NOT NULL,
  brand_fee_bps   INT         NOT NULL,
  creator_fee_bps INT         NOT NULL,
  effective_from  DATETIME(6) NOT NULL,
  changed_by      BIGINT,
  CONSTRAINT fk_fee_configs_changed_by FOREIGN KEY (changed_by) REFERENCES users (id)
);
CREATE INDEX ix_fee_configs_plan ON fee_configs (plan, effective_from);

INSERT INTO fee_configs (plan, brand_fee_bps, creator_fee_bps, effective_from) VALUES ('FREE', 1000, 1500, TIMESTAMP '2026-01-01 00:00:00');
INSERT INTO fee_configs (plan, brand_fee_bps, creator_fee_bps, effective_from) VALUES ('PRO', 500, 1500, TIMESTAMP '2026-01-01 00:00:00');
INSERT INTO fee_configs (plan, brand_fee_bps, creator_fee_bps, effective_from) VALUES ('PREMIUM', 200, 1500, TIMESTAMP '2026-01-01 00:00:00');

-- ---------- Payments (v2.0, Razorpay): a session per checkout, proof verified before the order exists ----------
CREATE TABLE payment_sessions (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id           VARCHAR(40)  NOT NULL,
  user_id             BIGINT       NOT NULL,
  purpose             VARCHAR(16)  NOT NULL,
  amount_cents        BIGINT       NOT NULL,
  razorpay_order_id   VARCHAR(40)  NOT NULL,
  razorpay_payment_id VARCHAR(40),
  payment_method      VARCHAR(16),
  payment_label       VARCHAR(120),
  used_by_ref         VARCHAR(40),
  created_at          DATETIME(6)  NOT NULL,
  expires_at          DATETIME(6)  NOT NULL,
  CONSTRAINT uq_payment_sessions_public_id UNIQUE (public_id),
  CONSTRAINT uq_payment_sessions_rzp_order UNIQUE (razorpay_order_id),
  CONSTRAINT fk_payment_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Razorpay tokens: card network and last four, or a UPI ID. Never a card number.
CREATE TABLE saved_payment_methods (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id  VARCHAR(40)  NOT NULL,
  user_id    BIGINT       NOT NULL,
  type       VARCHAR(8)   NOT NULL,
  network    VARCHAR(20),
  last4      VARCHAR(4),
  expiry     VARCHAR(5),
  vpa        VARCHAR(256),
  created_at DATETIME(6)  NOT NULL,
  CONSTRAINT uq_saved_payment_methods_public_id UNIQUE (public_id),
  CONSTRAINT fk_saved_payment_methods_user FOREIGN KEY (user_id) REFERENCES users (id)
);

-- ---------- Orders (FR-30 – FR-38) ----------
CREATE TABLE orders (
  id                     BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id              VARCHAR(26)  NOT NULL,
  brand_user_id          BIGINT       NOT NULL,
  creator_user_id        BIGINT       NOT NULL,
  package_id             BIGINT,
  campaign_id            BIGINT,
  kind                   VARCHAR(16)  NOT NULL,
  title                  VARCHAR(80)  NOT NULL,
  platform               VARCHAR(12)  NOT NULL,
  usage_rights           VARCHAR(80),
  status                 VARCHAR(20)  NOT NULL,
  close_reason           VARCHAR(10),
  currency               VARCHAR(3)   NOT NULL,
  price_cents            BIGINT       NOT NULL,
  brand_fee_cents        BIGINT       NOT NULL,
  creator_fee_cents      BIGINT       NOT NULL,
  brand_fee_bps          INT          NOT NULL,
  creator_fee_bps        INT          NOT NULL,
  intra_state            BOOLEAN      NOT NULL,
  creator_gst_registered BOOLEAN      NOT NULL,
  creator_gst_cents      BIGINT       NOT NULL,
  brand_fee_gst_cents    BIGINT       NOT NULL,
  creator_fee_gst_cents  BIGINT       NOT NULL,
  tds_cents              BIGINT       NOT NULL,
  tcs_cents              BIGINT       NOT NULL,
  promo_code             VARCHAR(20),
  promo_cents            BIGINT       NOT NULL DEFAULT 0,
  credit_cents           BIGINT       NOT NULL DEFAULT 0,
  delivery_days          INT          NOT NULL,
  accept_by              DATETIME(6)  NOT NULL,
  due_at                 DATETIME(6),
  review_by              DATETIME(6),
  revision_count         INT          NOT NULL DEFAULT 0,
  max_revisions          INT          NOT NULL,
  payment_status         VARCHAR(12)  NOT NULL,
  payment_amount_cents   BIGINT       NOT NULL,
  payment_refunded_cents BIGINT       NOT NULL DEFAULT 0,
  payment_method         VARCHAR(16)  NOT NULL,
  payment_method_label   VARCHAR(120) NOT NULL,
  razorpay_payment_id    VARCHAR(40),
  version                BIGINT       NOT NULL DEFAULT 0,
  created_at             DATETIME(6)  NOT NULL,
  updated_at             DATETIME(6)  NOT NULL,
  CONSTRAINT uq_orders_public_id UNIQUE (public_id),
  CONSTRAINT fk_orders_brand FOREIGN KEY (brand_user_id) REFERENCES users (id),
  CONSTRAINT fk_orders_creator FOREIGN KEY (creator_user_id) REFERENCES users (id),
  CONSTRAINT fk_orders_package FOREIGN KEY (package_id) REFERENCES packages (id)
);
CREATE INDEX ix_orders_brand_status ON orders (brand_user_id, status);
CREATE INDEX ix_orders_creator_status ON orders (creator_user_id, status);
CREATE INDEX ix_orders_status_accept_by ON orders (status, accept_by);
CREATE INDEX ix_orders_status_review_by ON orders (status, review_by);

-- What was bought (snapshot) and the add-ons chosen at checkout.
CREATE TABLE order_deliverables (
  order_id    BIGINT       NOT NULL,
  idx         INT          NOT NULL,
  deliverable VARCHAR(120) NOT NULL,
  CONSTRAINT pk_order_deliverables PRIMARY KEY (order_id, idx),
  CONSTRAINT fk_order_deliverables_order FOREIGN KEY (order_id) REFERENCES orders (id)
);

CREATE TABLE order_addons (
  order_id    BIGINT      NOT NULL,
  idx         INT         NOT NULL,
  addon_id    VARCHAR(26) NOT NULL,
  kind        VARCHAR(20) NOT NULL,
  title       VARCHAR(80) NOT NULL,
  price_cents BIGINT      NOT NULL,
  usage_days  INT,
  rush_days   INT,
  CONSTRAINT pk_order_addons PRIMARY KEY (order_id, idx),
  CONSTRAINT fk_order_addons_order FOREIGN KEY (order_id) REFERENCES orders (id)
);

-- FR-33 brief; shipping address only when the product ships.
CREATE TABLE order_briefs (
  order_id          BIGINT        NOT NULL PRIMARY KEY,
  requirements      VARCHAR(4000) NOT NULL,
  needs_shipping    BOOLEAN       NOT NULL,
  ship_name         VARCHAR(100),
  ship_line1        VARCHAR(200),
  ship_line2        VARCHAR(200),
  ship_city         VARCHAR(100),
  ship_postal_code  VARCHAR(20),
  ship_country      VARCHAR(2),
  updated_at        DATETIME(6)   NOT NULL,
  CONSTRAINT fk_order_briefs_order FOREIGN KEY (order_id) REFERENCES orders (id)
);

CREATE TABLE order_brief_links (
  order_id BIGINT       NOT NULL,
  idx      INT          NOT NULL,
  url      VARCHAR(500) NOT NULL,
  CONSTRAINT pk_order_brief_links PRIMARY KEY (order_id, idx),
  CONSTRAINT fk_order_brief_links_order FOREIGN KEY (order_id) REFERENCES orders (id)
);

CREATE TABLE order_brief_files (
  order_id BIGINT        NOT NULL,
  idx      INT           NOT NULL,
  url      VARCHAR(2048) NOT NULL,
  CONSTRAINT pk_order_brief_files PRIMARY KEY (order_id, idx),
  CONSTRAINT fk_order_brief_files_order FOREIGN KEY (order_id) REFERENCES orders (id)
);

-- Append-only timeline (order_events in CLAUDE.md §7).
CREATE TABLE order_events (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id    BIGINT       NOT NULL,
  type        VARCHAR(30)  NOT NULL,
  from_status VARCHAR(20),
  to_status   VARCHAR(20)  NOT NULL,
  actor_id    BIGINT,
  note        VARCHAR(2000),
  created_at  DATETIME(6)  NOT NULL,
  CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES orders (id)
);
CREATE INDEX ix_order_events_order ON order_events (order_id, id);

-- FR-34 deliveries: files or post links, one row per submission.
CREATE TABLE deliveries (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id    VARCHAR(26)   NOT NULL,
  order_id     BIGINT        NOT NULL,
  revision_no  INT           NOT NULL,
  note         VARCHAR(1000),
  submitted_at DATETIME(6)   NOT NULL,
  CONSTRAINT uq_deliveries_public_id UNIQUE (public_id),
  CONSTRAINT fk_deliveries_order FOREIGN KEY (order_id) REFERENCES orders (id)
);

CREATE TABLE delivery_items (
  delivery_id BIGINT        NOT NULL,
  idx         INT           NOT NULL,
  type        VARCHAR(10)   NOT NULL,
  url         VARCHAR(2048) NOT NULL,
  name        VARCHAR(200),
  CONSTRAINT pk_delivery_items PRIMARY KEY (delivery_id, idx),
  CONSTRAINT fk_delivery_items_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries (id)
);

-- FR-37 disputes: opened here; responses, evidence and resolution come with the disputes module.
CREATE TABLE disputes (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id    BIGINT        NOT NULL,
  opened_by   BIGINT        NOT NULL,
  reason      VARCHAR(2000) NOT NULL,
  reason_code VARCHAR(20)   NOT NULL,
  status      VARCHAR(10)   NOT NULL,
  respond_by  DATETIME(6)   NOT NULL,
  resolution  VARCHAR(16),
  refund_cents BIGINT,
  created_at  DATETIME(6)   NOT NULL,
  resolved_at DATETIME(6),
  CONSTRAINT uq_disputes_order UNIQUE (order_id),
  CONSTRAINT fk_disputes_order FOREIGN KEY (order_id) REFERENCES orders (id)
);

-- FR-38 reviews: one per completed order, one reply from the creator.
CREATE TABLE reviews (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id      VARCHAR(26)   NOT NULL,
  order_id       BIGINT        NOT NULL,
  creator_user_id BIGINT       NOT NULL,
  brand_user_id  BIGINT        NOT NULL,
  brand_name     VARCHAR(120)  NOT NULL,
  rating         INT           NOT NULL,
  comment        VARCHAR(1000),
  creator_reply  VARCHAR(500),
  replied_at     DATETIME(6),
  created_at     DATETIME(6)   NOT NULL,
  CONSTRAINT uq_reviews_public_id UNIQUE (public_id),
  CONSTRAINT uq_reviews_order UNIQUE (order_id),
  CONSTRAINT fk_reviews_order FOREIGN KEY (order_id) REFERENCES orders (id)
);
CREATE INDEX ix_reviews_creator ON reviews (creator_user_id, created_at);

-- ---------- Double-entry ledger (CLAUDE.md §4.1): every txn_id sums to zero ----------
-- ref: the order's public id (or payout_/sub_ ids later). party_user_id: whose balance a CREATOR_BALANCE line moves.
CREATE TABLE ledger_entries (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  txn_id        VARCHAR(26)  NOT NULL,
  ref           VARCHAR(40)  NOT NULL,
  account       VARCHAR(20)  NOT NULL,
  debit_cents   BIGINT       NOT NULL,
  credit_cents  BIGINT       NOT NULL,
  party_user_id BIGINT,
  memo          VARCHAR(200) NOT NULL,
  created_at    DATETIME(6)  NOT NULL,
  CONSTRAINT ck_ledger_entries_one_side CHECK ((debit_cents = 0 OR credit_cents = 0) AND debit_cents >= 0 AND credit_cents >= 0)
);
CREATE INDEX ix_ledger_entries_txn ON ledger_entries (txn_id);
CREATE INDEX ix_ledger_entries_ref ON ledger_entries (ref, account);
CREATE INDEX ix_ledger_entries_party ON ledger_entries (party_user_id, account);

-- ---------- Idempotency-Key: a retry returns the first answer (rebuilt from result_ref, the order id) ----------
CREATE TABLE idempotency_keys (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT        NOT NULL,
  idem_key   VARCHAR(100)  NOT NULL,
  method     VARCHAR(8)    NOT NULL,
  path       VARCHAR(200)  NOT NULL,
  status     INT           NOT NULL,
  result_ref VARCHAR(40)   NOT NULL,
  created_at DATETIME(6)   NOT NULL,
  CONSTRAINT uq_idempotency_keys UNIQUE (user_id, idem_key)
);
