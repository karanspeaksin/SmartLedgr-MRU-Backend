// src/routes/cashbook.js
const router = require("express").Router({ mergeParams: true });
const db     = require("../db");
const { auth, requireCompany } = require("../middleware/auth");

router.use(auth, requireCompany);

// GET /api/companies/:companyId/cashbooks
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM cash_books WHERE company_id=$1 ORDER BY created_at DESC", [req.companyId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/companies/:companyId/cashbooks/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows:[cb] } = await db.query(
      "SELECT * FROM cash_books WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    if (!cb) return res.status(404).json({ error: "Cash book not found" });
    const { rows: entries } = await db.query(
      "SELECT * FROM cash_book_entries WHERE cash_book_id=$1 ORDER BY sort_order,date", [cb.id]);
    res.json({ ...cb, entries });
  } catch (err) { next(err); }
});

// POST /api/companies/:companyId/cashbooks
router.post("/", async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { bankAccountId, periodLabel, openingBalance=0, entries=[] } = req.body;

    const totalIn  = entries.reduce((a,e)=>a+(parseFloat(e.moneyIn)||0),0);
    const totalOut = entries.reduce((a,e)=>a+(parseFloat(e.moneyOut)||0),0);
    const closing  = parseFloat(openingBalance) + totalIn - totalOut;

    const { rows:[cb] } = await client.query(`
      INSERT INTO cash_books (company_id,bank_account_id,period_label,opening_balance,closing_balance,created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.companyId, bankAccountId||null, periodLabel, openingBalance, closing, req.user.id]);

    for (let i=0; i<entries.length; i++) {
      const e = entries[i];
      await client.query(`
        INSERT INTO cash_book_entries (cash_book_id,sort_order,date,account_val,contact_name,reference,description,money_out,money_in)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [cb.id, i, e.date||null, e.account||"", e.contact||"", e.ref||"", e.desc||"",
         parseFloat(e.moneyOut)||0, parseFloat(e.moneyIn)||0]);
    }

    await client.query("COMMIT");
    res.status(201).json({ ...cb, entries });
  } catch (err) { await client.query("ROLLBACK"); next(err); }
  finally { client.release(); }
});

// DELETE /api/companies/:companyId/cashbooks/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM cash_books WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    res.json({ message: "Cash book deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
