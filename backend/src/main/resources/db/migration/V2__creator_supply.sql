-- Creator supply (Phase 1, Weeks 9–11): creator profiles, socials, packages, portfolio, payout accounts,
-- vetting, saved lists and uploaded files. Mirrors the frontend mock rows (frontend/src/api/mock/db.ts).
-- Portable between MySQL 8 and H2 (MySQL mode): one ALTER per column, no JSON columns.

-- ---------- Creator profile fields (FR-10, FR-16, FR-70, v2.5 availability) ----------
ALTER TABLE creator_profiles ADD COLUMN bio VARCHAR(1000);
ALTER TABLE creator_profiles ADD COLUMN city VARCHAR(80);
ALTER TABLE creator_profiles ADD COLUMN country VARCHAR(2);
-- Search filters only; never shown on the public profile.
ALTER TABLE creator_profiles ADD COLUMN gender VARCHAR(12);
ALTER TABLE creator_profiles ADD COLUMN birth_year INT;
ALTER TABLE creator_profiles ADD COLUMN submitted_at DATETIME(6);
-- Set on first approval; locks the username (brands link to it).
ALTER TABLE creator_profiles ADD COLUMN approved_at DATETIME(6);
ALTER TABLE creator_profiles ADD COLUMN profile_views BIGINT NOT NULL DEFAULT 0;
-- Vacation mode: away until `away_until` (inclusive) or until switched off.
ALTER TABLE creator_profiles ADD COLUMN away BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE creator_profiles ADD COLUMN away_until DATE;
ALTER TABLE creator_profiles ADD COLUMN away_message VARCHAR(200);
ALTER TABLE creator_profiles ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

CREATE INDEX ix_creator_profiles_vetting ON creator_profiles (vetting_status, country);

-- Ordered lists on the profile (niches 1–3, languages 1–5, covers 0–3).
CREATE TABLE creator_niches (
  creator_id BIGINT      NOT NULL,
  idx        INT         NOT NULL,
  niche      VARCHAR(20) NOT NULL,
  CONSTRAINT pk_creator_niches PRIMARY KEY (creator_id, idx),
  CONSTRAINT fk_creator_niches_creator FOREIGN KEY (creator_id) REFERENCES creator_profiles (id)
);
CREATE INDEX ix_creator_niches_niche ON creator_niches (niche, creator_id);

CREATE TABLE creator_languages (
  creator_id BIGINT     NOT NULL,
  idx        INT        NOT NULL,
  language   VARCHAR(2) NOT NULL,
  CONSTRAINT pk_creator_languages PRIMARY KEY (creator_id, idx),
  CONSTRAINT fk_creator_languages_creator FOREIGN KEY (creator_id) REFERENCES creator_profiles (id)
);
CREATE INDEX ix_creator_languages_language ON creator_languages (language, creator_id);

CREATE TABLE creator_cover_urls (
  creator_id BIGINT        NOT NULL,
  idx        INT           NOT NULL,
  url        VARCHAR(2048) NOT NULL,
  CONSTRAINT pk_creator_cover_urls PRIMARY KEY (creator_id, idx),
  CONSTRAINT fk_creator_cover_urls_creator FOREIGN KEY (creator_id) REFERENCES creator_profiles (id)
);

-- ---------- Social accounts (FR-11): one per platform ----------
CREATE TABLE social_accounts (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id           VARCHAR(26)  NOT NULL,
  creator_id          BIGINT       NOT NULL,
  platform            VARCHAR(12)  NOT NULL,
  handle              VARCHAR(40)  NOT NULL,
  url                 VARCHAR(300),
  followers           BIGINT       NOT NULL,
  engagement_rate_bps INT,
  -- Set when our team has checked the account (badge on cards).
  verified_at         DATETIME(6),
  created_at          DATETIME(6)  NOT NULL,
  CONSTRAINT uq_social_accounts_public_id UNIQUE (public_id),
  CONSTRAINT uq_social_accounts_platform UNIQUE (creator_id, platform),
  CONSTRAINT fk_social_accounts_creator FOREIGN KEY (creator_id) REFERENCES creator_profiles (id)
);
CREATE INDEX ix_social_accounts_platform ON social_accounts (platform, followers);

-- ---------- Packages (FR-12, FR-13) with deliverables and add-ons (v2.4) ----------
CREATE TABLE packages (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id     VARCHAR(26)   NOT NULL,
  creator_id    BIGINT        NOT NULL,
  platform      VARCHAR(12)   NOT NULL,
  title         VARCHAR(80)   NOT NULL,
  description   VARCHAR(1000) NOT NULL,
  price_cents   BIGINT        NOT NULL,
  currency      VARCHAR(3)    NOT NULL DEFAULT 'INR',
  delivery_days INT           NOT NULL,
  active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME(6)   NOT NULL,
  updated_at    DATETIME(6)   NOT NULL,
  version       BIGINT        NOT NULL DEFAULT 0,
  CONSTRAINT uq_packages_public_id UNIQUE (public_id),
  CONSTRAINT fk_packages_creator FOREIGN KEY (creator_id) REFERENCES creator_profiles (id)
);
CREATE INDEX ix_packages_creator_active ON packages (creator_id, active);

CREATE TABLE package_deliverables (
  package_id  BIGINT       NOT NULL,
  idx         INT          NOT NULL,
  deliverable VARCHAR(120) NOT NULL,
  CONSTRAINT pk_package_deliverables PRIMARY KEY (package_id, idx),
  CONSTRAINT fk_package_deliverables_package FOREIGN KEY (package_id) REFERENCES packages (id)
);

-- One of each kind per package; `addon_id` stays stable across edits so open checkouts still match.
CREATE TABLE package_addons (
  package_id  BIGINT      NOT NULL,
  idx         INT         NOT NULL,
  addon_id    VARCHAR(26) NOT NULL,
  kind        VARCHAR(20) NOT NULL,
  title       VARCHAR(80) NOT NULL,
  price_cents BIGINT      NOT NULL,
  usage_days  INT,
  rush_days   INT,
  CONSTRAINT pk_package_addons PRIMARY KEY (package_id, idx),
  CONSTRAINT fk_package_addons_package FOREIGN KEY (package_id) REFERENCES packages (id)
);

-- ---------- Portfolio (FR-14): up to 12 images or https video links ----------
CREATE TABLE portfolio_items (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id  VARCHAR(26)   NOT NULL,
  creator_id BIGINT        NOT NULL,
  type       VARCHAR(12)   NOT NULL,
  url        VARCHAR(2048) NOT NULL,
  caption    VARCHAR(140),
  sort_order INT           NOT NULL,
  created_at DATETIME(6)   NOT NULL,
  CONSTRAINT uq_portfolio_items_public_id UNIQUE (public_id),
  CONSTRAINT fk_portfolio_items_creator FOREIGN KEY (creator_id) REFERENCES creator_profiles (id)
);
CREATE INDEX ix_portfolio_items_creator ON portfolio_items (creator_id, sort_order);

-- ---------- Payout account (FR-62, v2.0 India): PAN + bank account/IFSC or UPI ID ----------
-- Verification (penny drop / VPA check) is simulated until Razorpay is wired in the payments module.
CREATE TABLE payout_accounts (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  creator_id     BIGINT       NOT NULL,
  method         VARCHAR(16)  NOT NULL,
  holder_name    VARCHAR(100) NOT NULL,
  pan            VARCHAR(10)  NOT NULL,
  account_number VARCHAR(18),
  ifsc           VARCHAR(11),
  vpa            VARCHAR(256),
  gstin          VARCHAR(15),
  status         VARCHAR(12)  NOT NULL,
  failure_reason VARCHAR(300),
  created_at     DATETIME(6)  NOT NULL,
  updated_at     DATETIME(6)  NOT NULL,
  CONSTRAINT uq_payout_accounts_creator UNIQUE (creator_id),
  CONSTRAINT fk_payout_accounts_creator FOREIGN KEY (creator_id) REFERENCES creator_profiles (id)
);

-- ---------- Saved lists (FR-25): a brand's shortlists of creators ----------
CREATE TABLE saved_lists (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id     VARCHAR(26) NOT NULL,
  brand_user_id BIGINT      NOT NULL,
  name          VARCHAR(60) NOT NULL,
  created_at    DATETIME(6) NOT NULL,
  updated_at    DATETIME(6) NOT NULL,
  CONSTRAINT uq_saved_lists_public_id UNIQUE (public_id),
  CONSTRAINT fk_saved_lists_brand FOREIGN KEY (brand_user_id) REFERENCES users (id)
);
CREATE INDEX ix_saved_lists_brand ON saved_lists (brand_user_id, created_at);

CREATE TABLE saved_list_creators (
  list_id    BIGINT      NOT NULL,
  creator_id BIGINT      NOT NULL,
  added_at   DATETIME(6) NOT NULL,
  CONSTRAINT pk_saved_list_creators PRIMARY KEY (list_id, creator_id),
  CONSTRAINT fk_saved_list_creators_list FOREIGN KEY (list_id) REFERENCES saved_lists (id),
  CONSTRAINT fk_saved_list_creators_creator FOREIGN KEY (creator_id) REFERENCES creator_profiles (id)
);

-- ---------- Uploaded files (POST /files/presign) ----------
CREATE TABLE stored_files (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id     VARCHAR(26)  NOT NULL,
  owner_user_id BIGINT       NOT NULL,
  storage_key   VARCHAR(200) NOT NULL,
  purpose       VARCHAR(24)  NOT NULL,
  content_type  VARCHAR(40)  NOT NULL,
  size_bytes    BIGINT       NOT NULL,
  uploaded_at   DATETIME(6),
  created_at    DATETIME(6)  NOT NULL,
  CONSTRAINT uq_stored_files_public_id UNIQUE (public_id),
  CONSTRAINT uq_stored_files_key UNIQUE (storage_key),
  CONSTRAINT fk_stored_files_owner FOREIGN KEY (owner_user_id) REFERENCES users (id)
);
