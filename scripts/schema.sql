-- ═══════════════════════════════════════════════════
-- SmartLedgr — PostgreSQL Schema
-- Run: psql -U postgres -d smartledgr -f schema.sql
-- ═══════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── COMPANIES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  currency      VARCHAR(10)  NOT NULL DEFAULT 'USD',
  symbol        VARCHAR(5)   NOT NULL DEFAULT '$',
  country       VARCHAR(100),
  fiscal_end    VARCHAR(20)  DEFAULT 'December',
  tax_no        VARCHAR(100),
  cin           VARCHAR(100),
  email         VARCHAR(255),
  phone         VARCHAR(50),
  address       TEXT,
  timezone      VARCHAR(100) DEFAULT 'UTC',
  date_format   VARCHAR(20)  DEFAULT 'MM/DD/YYYY',
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── USERS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50)  NOT NULL DEFAULT 'Staff',  -- Admin | Manager | Staff
  avatar        VARCHAR(10),
  is_active     BOOLEAN      DEFAULT TRUE,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── USER ↔ COMPANY (many-to-many) ───────────────
CREATE TABLE IF NOT EXISTS user_companies (
  user_id     UUID REFERENCES users(id)     ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  role        VARCHAR(50) DEFAULT 'Staff',
  PRIMARY KEY (user_id, company_id)
);

-- ─── ACCOUNTS (Chart of Accounts) ────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  code        VARCHAR(20)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  type        VARCHAR(50)  NOT NULL, -- Asset | Liability | Equity | Revenue | Expense
  tax_rate    VARCHAR(100) DEFAULT 'Exempt',
  balance     NUMERIC(18,2) DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, code)
);

-- ─── TAXES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taxes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(50)  NOT NULL, -- Output | Input | Exempt
  rate        NUMERIC(5,2) DEFAULT 0,
  status      VARCHAR(20)  DEFAULT 'Active',
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── BANK ACCOUNTS ────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  account_no  VARCHAR(100),
  bank        VARCHAR(255),
  type        VARCHAR(50)  DEFAULT 'Current', -- Current | Savings | Cash
  currency    VARCHAR(10)  DEFAULT 'USD',
  balance     NUMERIC(18,2) DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONTACTS (Customers & Suppliers) ─────────────
CREATE TABLE IF NOT EXISTS contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  type        VARCHAR(20)  NOT NULL, -- customer | supplier
  name        VARCHAR(255) NOT NULL,
  brn         VARCHAR(100),
  vat_no      VARCHAR(100),
  phone       VARCHAR(50),
  email       VARCHAR(255),
  address1    TEXT,
  address2    TEXT,
  city        VARCHAR(100),
  country     VARCHAR(100),
  currency    VARCHAR(10)  DEFAULT 'USD',
  ar_balance  NUMERIC(18,2) DEFAULT 0,
  ap_balance  NUMERIC(18,2) DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INVOICES (Sales & Purchase) ──────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  type          VARCHAR(20) NOT NULL, -- sales | purchase
  invoice_no    VARCHAR(50) NOT NULL,
  contact_id    UUID REFERENCES contacts(id),
  contact_name  VARCHAR(255),          -- denormalized for speed
  date          DATE        NOT NULL,
  currency      VARCHAR(10) DEFAULT 'USD',
  exchange_rate NUMERIC(12,6) DEFAULT 1,
  amounts_are   VARCHAR(30) DEFAULT 'Tax Exclusive',
  reference     VARCHAR(255),
  status        VARCHAR(50) DEFAULT 'Draft', -- Draft | Awaiting Payment | Paid | Overdue
  subtotal      NUMERIC(18,2) DEFAULT 0,
  tax_total     NUMERIC(18,2) DEFAULT 0,
  total         NUMERIC(18,2) DEFAULT 0,
  notes         TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, invoice_no)
);

-- ─── INVOICE LINE ITEMS ────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID REFERENCES invoices(id) ON DELETE CASCADE,
  sort_order  INT DEFAULT 0,
  item        VARCHAR(255),
  description TEXT,
  qty         NUMERIC(12,4) DEFAULT 1,
  price       NUMERIC(18,2) DEFAULT 0,
  account_id  UUID REFERENCES accounts(id),
  account_val VARCHAR(255),  -- "200 - Sales" denormalized
  tax_id      UUID REFERENCES taxes(id),
  tax_name    VARCHAR(100),
  tax_rate    NUMERIC(5,2) DEFAULT 0,
  amount      NUMERIC(18,2) DEFAULT 0
);

-- ─── INVOICE HISTORY NOTES ────────────────────────
CREATE TABLE IF NOT EXISTS invoice_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID REFERENCES invoices(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  user_name   VARCHAR(255),
  action      VARCHAR(100),
  detail      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RETURNS (Sales & Purchase) ───────────────────
CREATE TABLE IF NOT EXISTS returns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  type          VARCHAR(20) NOT NULL, -- sales | purchase
  return_no     VARCHAR(50) NOT NULL,
  contact_id    UUID REFERENCES contacts(id),
  contact_name  VARCHAR(255),
  date          DATE        NOT NULL,
  currency      VARCHAR(10) DEFAULT 'USD',
  exchange_rate NUMERIC(12,6) DEFAULT 1,
  amounts_are   VARCHAR(30) DEFAULT 'Tax Exclusive',
  status        VARCHAR(50) DEFAULT 'Draft',
  total         NUMERIC(18,2) DEFAULT 0,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id   UUID REFERENCES returns(id) ON DELETE CASCADE,
  sort_order  INT DEFAULT 0,
  item        VARCHAR(255),
  description TEXT,
  qty         NUMERIC(12,4) DEFAULT 1,
  price       NUMERIC(18,2) DEFAULT 0,
  account_val VARCHAR(255),
  tax_name    VARCHAR(100),
  amount      NUMERIC(18,2) DEFAULT 0
);

-- ─── CASH BOOKS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_books (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id  UUID REFERENCES bank_accounts(id),
  period_label     VARCHAR(50),   -- "June 2024"
  opening_balance  NUMERIC(18,2) DEFAULT 0,
  closing_balance  NUMERIC(18,2) DEFAULT 0,
  status           VARCHAR(20)   DEFAULT 'OPEN', -- OPEN | Reconciled
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_book_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_book_id  UUID REFERENCES cash_books(id) ON DELETE CASCADE,
  sort_order    INT DEFAULT 0,
  date          DATE,
  account_id    UUID REFERENCES accounts(id),
  account_val   VARCHAR(255),
  contact_id    UUID REFERENCES contacts(id),
  contact_name  VARCHAR(255),
  reference     VARCHAR(255),
  description   TEXT,
  money_out     NUMERIC(18,2) DEFAULT 0,
  money_in      NUMERIC(18,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── JOURNAL ENTRIES ──────────────────────────────
CREATE TABLE IF NOT EXISTS journals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  journal_no  VARCHAR(50),
  date        DATE        NOT NULL,
  reference   VARCHAR(255),
  notes       TEXT,
  status      VARCHAR(20) DEFAULT 'Draft', -- Draft | PUBLISHED
  method      VARCHAR(50) DEFAULT 'Accrual and Cash',
  currency    VARCHAR(10) DEFAULT 'USD',
  amounts_are VARCHAR(30) DEFAULT 'Tax Exclusive',
  total_in    NUMERIC(18,2) DEFAULT 0,
  total_out   NUMERIC(18,2) DEFAULT 0,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id    UUID REFERENCES journals(id) ON DELETE CASCADE,
  sort_order    INT DEFAULT 0,
  account_id    UUID REFERENCES accounts(id),
  account_val   VARCHAR(255),
  description   TEXT,
  contact_id    UUID REFERENCES contacts(id),
  contact_name  VARCHAR(255),
  money_in      NUMERIC(18,2) DEFAULT 0,
  money_out     NUMERIC(18,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS journal_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id  UUID REFERENCES journals(id) ON DELETE CASCADE,
  user_name   VARCHAR(255),
  action      VARCHAR(100),
  detail      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BANK RECONCILIATION ──────────────────────────
CREATE TABLE IF NOT EXISTS reconciliations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  cash_book_id    UUID REFERENCES cash_books(id),
  bank_account_id UUID REFERENCES bank_accounts(id),
  status          VARCHAR(20) DEFAULT 'In Progress', -- In Progress | Finalized
  finalized_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID REFERENCES reconciliations(id) ON DELETE CASCADE,
  date              DATE,
  account_name      VARCHAR(255),
  contact_name      VARCHAR(255),
  statement_detail  TEXT,
  money_in          NUMERIC(18,2) DEFAULT 0,
  money_out         NUMERIC(18,2) DEFAULT 0,
  is_reconciled     BOOLEAN DEFAULT FALSE,
  reconciled_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_company    ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_contacts_company    ON contacts(company_id, type);
CREATE INDEX IF NOT EXISTS idx_accounts_company    ON accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_journals_company    ON journals(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_books_company  ON cash_books(company_id);
CREATE INDEX IF NOT EXISTS idx_cb_entries_book     ON cash_book_entries(cash_book_id);

-- ─── UPDATED_AT TRIGGER ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_updated_at
BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_journals
BEFORE UPDATE ON journals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_contacts
BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
