// src/routes/master.js — Chart of Accounts, Taxes, Bank Accounts, Company Setup
const router = require("express").Router({ mergeParams: true });
const db     = require("../db");
const { auth, requireCompany } = require("../middleware/auth");

router.use(auth, requireCompany);

// ══════════════════════════════════════════════
// CHART OF ACCOUNTS
// ══════════════════════════════════════════════
router.get("/accounts", async (req, res, next) => {
  try {
    const { type } = req.query;
    let q = "SELECT * FROM accounts WHERE company_id=$1 AND is_active=TRUE";
    const p = [req.companyId];
    if (type) { q += ` AND type=$${p.length+1}`; p.push(type); }
    q += " ORDER BY code";
    const { rows } = await db.query(q, p);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/accounts", async (req, res, next) => {
  try {
    const { code, name, type, taxRate="Exempt", balance=0 } = req.body;
    if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: "Code and Name are required" });
    const { rows } = await db.query(`
      INSERT INTO accounts (company_id,code,name,type,tax_rate,balance)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.companyId, code.trim(), name.trim(), type||"Expense", taxRate, parseFloat(balance)||0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Account code already exists" });
    next(err);
  }
});

router.put("/accounts/:id", async (req, res, next) => {
  try {
    const { name, type, taxRate, balance } = req.body;
    const { rows } = await db.query(`
      UPDATE accounts SET name=$1,type=$2,tax_rate=$3,balance=$4
      WHERE id=$5 AND company_id=$6 RETURNING *`,
      [name, type, taxRate, balance, req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ error: "Account not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/accounts/:id", async (req, res, next) => {
  try {
    await db.query("UPDATE accounts SET is_active=FALSE WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    res.json({ message: "Account deleted" });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════
// TAXES
// ══════════════════════════════════════════════
router.get("/taxes", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM taxes WHERE company_id=$1 ORDER BY name", [req.companyId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/taxes", async (req, res, next) => {
  try {
    const { name, type, rate, status="Active" } = req.body;
    const { rows } = await db.query(`
      INSERT INTO taxes (company_id,name,type,rate,status) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.companyId, name, type||"Output", parseFloat(rate)||0, status]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/taxes/:id", async (req, res, next) => {
  try {
    const { name, type, rate, status } = req.body;
    const { rows } = await db.query(`
      UPDATE taxes SET name=$1,type=$2,rate=$3,status=$4 WHERE id=$5 AND company_id=$6 RETURNING *`,
      [name, type, rate, status, req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ error: "Tax not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/taxes/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM taxes WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    res.json({ message: "Tax deleted" });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════
// BANK ACCOUNTS
// ══════════════════════════════════════════════
router.get("/banks", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM bank_accounts WHERE company_id=$1 AND is_active=TRUE ORDER BY name", [req.companyId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/banks", async (req, res, next) => {
  try {
    const { name, accountNo, bank, type="Current", currency="USD", balance=0 } = req.body;
    const { rows } = await db.query(`
      INSERT INTO bank_accounts (company_id,name,account_no,bank,type,currency,balance)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.companyId, name, accountNo||null, bank||null, type, currency, parseFloat(balance)||0]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/banks/:id", async (req, res, next) => {
  try {
    const { name, accountNo, bank, type, currency, balance } = req.body;
    const { rows } = await db.query(`
      UPDATE bank_accounts SET name=$1,account_no=$2,bank=$3,type=$4,currency=$5,balance=$6
      WHERE id=$7 AND company_id=$8 RETURNING *`,
      [name, accountNo, bank, type, currency, balance, req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ error: "Bank account not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/banks/:id", async (req, res, next) => {
  try {
    await db.query("UPDATE bank_accounts SET is_active=FALSE WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    res.json({ message: "Bank account deleted" });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════
// COMPANY SETUP
// ══════════════════════════════════════════════
router.get("/company", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM companies WHERE id=$1", [req.companyId]);
    if (!rows[0]) return res.status(404).json({ error: "Company not found" });
    const c = rows[0];
    res.json({
      id:c.id, name:c.name, currency:c.currency, symbol:c.symbol, country:c.country,
      fiscalEnd:c.fiscal_end, taxNo:c.tax_no, cin:c.cin, email:c.email, phone:c.phone,
      address:c.address, timezone:c.timezone, dateFormat:c.date_format,
    });
  } catch (err) { next(err); }
});

router.put("/company", async (req, res, next) => {
  try {
    const { name, currency, symbol, country, fiscalEnd, taxNo, cin, email, phone, address, timezone, dateFormat } = req.body;
    const { rows } = await db.query(`
      UPDATE companies SET name=$1,currency=$2,symbol=$3,country=$4,fiscal_end=$5,
        tax_no=$6,cin=$7,email=$8,phone=$9,address=$10,timezone=$11,date_format=$12,updated_at=NOW()
      WHERE id=$13 RETURNING *`,
      [name,currency,symbol,country,fiscalEnd,taxNo,cin,email,phone,address,timezone,dateFormat,req.companyId]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
