// src/routes/journals.js
const router = require("express").Router({ mergeParams: true });
const db     = require("../db");
const { auth, requireCompany } = require("../middleware/auth");

router.use(auth, requireCompany);

const fmt = (j, lines=[], notes=[]) => ({
  id:         j.id,
  journalNo:  j.journal_no,
  date:       j.date,
  reference:  j.reference,
  notes:      j.notes,
  status:     j.status,
  method:     j.method,
  currency:   j.currency,
  amountsAre: j.amounts_are,
  totalIn:    parseFloat(j.total_in),
  totalOut:   parseFloat(j.total_out),
  createdAt:  j.created_at,
  lines: lines.map(l => ({
    id:          l.id,
    account:     l.account_val,
    description: l.description,
    contact:     l.contact_name,
    moneyIn:     parseFloat(l.money_in),
    moneyOut:    parseFloat(l.money_out),
  })),
  historyNotes: notes.map(n => ({ date:n.created_at, user:n.user_name, action:n.action, detail:n.detail })),
});

// GET /api/companies/:companyId/journals
router.get("/", async (req, res, next) => {
  try {
    const { status } = req.query;
    let q = "SELECT * FROM journals WHERE company_id=$1";
    const p = [req.companyId];
    if (status) { q += ` AND status=$${p.length+1}`; p.push(status); }
    q += " ORDER BY date DESC, created_at DESC";
    const { rows } = await db.query(q, p);
    res.json(rows.map(r => fmt(r)));
  } catch (err) { next(err); }
});

// GET /api/companies/:companyId/journals/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows:[j] } = await db.query(
      "SELECT * FROM journals WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    if (!j) return res.status(404).json({ error: "Journal not found" });
    const { rows: lines } = await db.query(
      "SELECT * FROM journal_lines WHERE journal_id=$1 ORDER BY sort_order", [j.id]);
    const { rows: notes } = await db.query(
      "SELECT * FROM journal_notes WHERE journal_id=$1 ORDER BY created_at", [j.id]);
    res.json(fmt(j, lines, notes));
  } catch (err) { next(err); }
});

// POST /api/companies/:companyId/journals
router.post("/", async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { journalNo, date, reference, notes, status="Draft", method, currency, amountsAre, lines=[] } = req.body;

    const totalIn  = lines.reduce((a,l)=>a+(parseFloat(l.moneyIn)||0),0);
    const totalOut = lines.reduce((a,l)=>a+(parseFloat(l.moneyOut)||0),0);

    const { rows:[j] } = await client.query(`
      INSERT INTO journals (company_id,journal_no,date,reference,notes,status,method,currency,amounts_are,total_in,total_out,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.companyId, journalNo, date, reference||null, notes||null, status,
       method||"Accrual and Cash", currency||"USD", amountsAre||"Tax Exclusive",
       totalIn, totalOut, req.user.id]);

    for (let i=0; i<lines.length; i++) {
      const l = lines[i];
      await client.query(`
        INSERT INTO journal_lines (journal_id,sort_order,account_val,description,contact_name,money_in,money_out)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [j.id, i, l.account||"", l.description||"", l.contact||"",
         parseFloat(l.moneyIn)||0, parseFloat(l.moneyOut)||0]);
    }

    await client.query(`INSERT INTO journal_notes (journal_id,user_name,action,detail) VALUES ($1,$2,$3,$4)`,
      [j.id, req.user.name, "Created", `Journal ${journalNo} created`]);

    await client.query("COMMIT");
    res.status(201).json(fmt(j));
  } catch (err) { await client.query("ROLLBACK"); next(err); }
  finally { client.release(); }
});

// PATCH /api/companies/:companyId/journals/:id/publish
router.patch("/:id/publish", async (req, res, next) => {
  try {
    const { rows:[j] } = await db.query(
      "UPDATE journals SET status='PUBLISHED',updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *",
      [req.params.id, req.companyId]);
    if (!j) return res.status(404).json({ error: "Journal not found" });
    await db.query(`INSERT INTO journal_notes (journal_id,user_name,action,detail) VALUES ($1,$2,$3,$4)`,
      [j.id, req.user.name, "Published", "Journal entry published"]);
    res.json(fmt(j));
  } catch (err) { next(err); }
});

// DELETE /api/companies/:companyId/journals/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { rows:[j] } = await db.query(
      "SELECT status FROM journals WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    if (!j) return res.status(404).json({ error: "Journal not found" });
    if (j.status === "PUBLISHED") return res.status(400).json({ error: "Cannot delete a published journal" });
    await db.query("DELETE FROM journals WHERE id=$1", [req.params.id]);
    res.json({ message: "Journal deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
