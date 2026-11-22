-- Foundation and auth (Phase 1, Weeks 7–8). CLAUDE.md §7: BIGINT ids, ULID public ids, UTC timestamps.
-- Portable between MySQL 8 and H2 (MySQL mode), so tests run without Docker.

CREATE TABLE users (
  id                     BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id              VARCHAR(26)     NOT NULL,
  email                  VARCHAR(254) NOT NULL,
  name                   VARCHAR(80)  NOT NULL,
  role                   VARCHAR(16)  NOT NULL,
  status                 VARCHAR(16)  NOT NULL,
  password_hash          VARCHAR(100),
  google_sub             VARCHAR(64),
  email_verified_at      DATETIME(6),
  avatar_url             VARCHAR(2048),
  last_active_at         DATETIME(6),
  deletion_scheduled_for DATETIME(6),
  deleted_at             DATETIME(6),
  created_at             DATETIME(6)  NOT NULL,
  updated_at             DATETIME(6)  NOT NULL,
  version                BIGINT       NOT NULL DEFAULT 0,
  CONSTRAINT uq_users_public_id UNIQUE (public_id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_google_sub UNIQUE (google_sub)
);

-- One row per sign-in (a refresh-token family). Access tokens carry its id, so signing out or
-- revoking sessions takes effect immediately. impersonator_id: read-only admin view (FR-82).
CREATE TABLE auth_sessions (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id       VARCHAR(26)    NOT NULL,
  user_id         BIGINT      NOT NULL,
  impersonator_id BIGINT,
  created_at      DATETIME(6) NOT NULL,
  last_used_at    DATETIME(6) NOT NULL,
  revoked_at      DATETIME(6),
  CONSTRAINT uq_auth_sessions_public_id UNIQUE (public_id),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_auth_sessions_impersonator FOREIGN KEY (impersonator_id) REFERENCES users (id)
);
CREATE INDEX ix_auth_sessions_user ON auth_sessions (user_id, revoked_at);

-- Rotating refresh tokens (FR-04): only a SHA-256 hash is stored.
CREATE TABLE refresh_tokens (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT      NOT NULL,
  user_id    BIGINT      NOT NULL,
  token_hash VARCHAR(64)    NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6),
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash),
  CONSTRAINT fk_refresh_tokens_session FOREIGN KEY (session_id) REFERENCES auth_sessions (id),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Email verification (24 h) and password reset (30 min, FR-03) links. Hash only; single use.
CREATE TABLE one_time_tokens (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT      NOT NULL,
  kind       VARCHAR(20) NOT NULL,
  token_hash VARCHAR(64)    NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at    DATETIME(6),
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT uq_one_time_tokens_hash UNIQUE (token_hash),
  CONSTRAINT fk_one_time_tokens_user FOREIGN KEY (user_id) REFERENCES users (id)
);
CREATE INDEX ix_one_time_tokens_user ON one_time_tokens (user_id, kind, created_at);

-- Outgoing email, SMS and WhatsApp (outbox pattern: a sender job delivers and stamps sent_at).
CREATE TABLE message_outbox (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id  VARCHAR(26)      NOT NULL,
  channel    VARCHAR(10)   NOT NULL,
  to_address VARCHAR(254)  NOT NULL,
  subject    VARCHAR(200)  NOT NULL,
  body       VARCHAR(4000) NOT NULL,
  link       VARCHAR(1024),
  created_at DATETIME(6)   NOT NULL,
  sent_at    DATETIME(6),
  CONSTRAINT uq_message_outbox_public_id UNIQUE (public_id)
);
CREATE INDEX ix_message_outbox_to ON message_outbox (to_address, created_at);

-- Profiles start minimal here; their modules add the remaining columns (Weeks 9–11).
CREATE TABLE brand_profiles (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT       NOT NULL,
  company_name        VARCHAR(120),
  website             VARCHAR(300),
  logo_url            VARCHAR(2048),
  industry            VARCHAR(30),
  country             VARCHAR(2),
  state               VARCHAR(4),
  gstin               VARCHAR(15),
  plan                VARCHAR(10)  NOT NULL DEFAULT 'FREE',
  razorpay_customer_id VARCHAR(64),
  created_at          DATETIME(6)  NOT NULL,
  updated_at          DATETIME(6)  NOT NULL,
  CONSTRAINT uq_brand_profiles_user UNIQUE (user_id),
  CONSTRAINT fk_brand_profiles_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE creator_profiles (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT       NOT NULL,
  username         VARCHAR(30),
  display_name     VARCHAR(80)  NOT NULL,
  photo_url        VARCHAR(2048),
  vetting_status   VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
  rejection_reason VARCHAR(500),
  payout_status    VARCHAR(20)  NOT NULL DEFAULT 'NOT_STARTED',
  created_at       DATETIME(6)  NOT NULL,
  updated_at       DATETIME(6)  NOT NULL,
  CONSTRAINT uq_creator_profiles_user UNIQUE (user_id),
  CONSTRAINT uq_creator_profiles_username UNIQUE (username),
  CONSTRAINT fk_creator_profiles_user FOREIGN KEY (user_id) REFERENCES users (id)
);

-- FR-84: append-only audit log of admin actions and money movements.
CREATE TABLE audit_logs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  public_id   VARCHAR(26)      NOT NULL,
  actor_id    BIGINT,
  actor_name  VARCHAR(120)  NOT NULL,
  action      VARCHAR(40)   NOT NULL,
  entity_type VARCHAR(40)   NOT NULL,
  entity_id   VARCHAR(80)   NOT NULL,
  summary     VARCHAR(500)  NOT NULL,
  before_json TEXT,
  after_json  TEXT,
  ip          VARCHAR(45),
  created_at  DATETIME(6)   NOT NULL,
  CONSTRAINT uq_audit_logs_public_id UNIQUE (public_id)
);
CREATE INDEX ix_audit_logs_action ON audit_logs (action, created_at);
