// src/routes/reconciliation.js
const router = require("express").Router({ mergeParams: true });
const db     = require("../db");
const { auth, requireCompany } = require("../middleware/auth");

router.use(auth, requireCompany);

// GET /api/companies/:companyId/reconciliations
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM reconciliations WHERE company_id=$1 ORDER BY created_at DESC", [req.companyId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/companies/:companyId/reconciliations/:id  (with items)
router.get("/:id", async (req, res, next) => {
  try {
    const { rows:[rec] } = await db.query(
      "SELECT * FROM reconciliations WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    if (!rec) return res.status(404).json({ error: "Reconciliation not found" });
    const { rows: items } = await db.query(
      "SELECT * FROM reconciliation_items WHERE reconciliation_id=$1 ORDER BY date", [rec.id]);
    res.json({ ...rec, items });
  } catch (err) { next(err); }
});

// POST /api/companies/:companyId/reconciliations  — create + import cash book
router.post("/", async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { cashBookId, bankAccountId, items=[] } = req.body;

    const { rows:[rec] } = await client.query(`
      INSERT INTO reconciliations (company_id,cash_book_id,bank_account_id,created_by)
      VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.companyId, cashBookId||null, bankAccountId||null, req.user.id]);

    for (const item of items) {
      await client.query(`
        INSERT INTO reconciliation_items (reconciliation_id,date,account_name,contact_name,statement_detail,money_in,money_out,is_reconciled)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [rec.id, item.date||null, item.account||"", item.contact||"",
         item.detail||"", parseFloat(item.moneyIn)||0, parseFloat(item.moneyOut)||0, false]);
    }

    await client.query("COMMIT");
    const { rows: savedItems } = await db.query(
      "SELECT * FROM reconciliation_items WHERE reconciliation_id=$1 ORDER BY date", [rec.id]);
    res.status(201).json({ ...rec, items: savedItems });
  } catch (err) { await client.query("ROLLBACK"); next(err); }
  finally { client.release(); }
});

// PATCH /api/companies/:companyId/reconciliations/:id/items/:itemId — toggle reconcile
router.patch("/:id/items/:itemId", async (req, res, next) => {
  try {
    const { isReconciled } = req.body;
    const { rows:[item] } = await db.query(`
      UPDATE reconciliation_items
      SET is_reconciled=$1, reconciled_at=$2
      WHERE id=$3 AND reconciliation_id=$4 RETURNING *`,
      [isReconciled, isReconciled ? new Date() : null, req.params.itemId, req.params.id]);
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err) { next(err); }
});

// PATCH /api/companies/:companyId/reconciliations/:id/finalize
router.patch("/:id/finalize", async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    // Mark all items reconciled
    await client.query(
      "UPDATE reconciliation_items SET is_reconciled=TRUE,reconciled_at=NOW() WHERE reconciliation_id=$1",
      [req.params.id]);
    // Mark reconciliation finalized
    const { rows:[rec] } = await client.query(
      "UPDATE reconciliations SET status='Finalized',finalized_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *",
      [req.params.id, req.companyId]);
    if (!rec) return res.status(404).json({ error: "Reconciliation not found" });
    // Mark the cash book as reconciled
    if (rec.cash_book_id) {
      await client.query("UPDATE cash_books SET status='Reconciled' WHERE id=$1", [rec.cash_book_id]);
    }
    await client.query("COMMIT");
    res.json(rec);
  } catch (err) { await client.query("ROLLBACK"); next(err); }
  finally { client.release(); }
});

// DELETE /api/companies/:companyId/reconciliations/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM reconciliations WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    res.json({ message: "Reconciliation deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
