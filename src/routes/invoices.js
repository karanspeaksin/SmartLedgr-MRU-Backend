// src/routes/invoices.js
const router = require("express").Router({ mergeParams: true });
const db     = require("../db");
const { auth, requireCompany } = require("../middleware/auth");

router.use(auth, requireCompany);

// ── HELPERS ──────────────────────────────────────────
const fmtInvoice = (inv, lines=[], notes=[]) => ({
  id:           inv.id,
  invoiceNo:    inv.invoice_no,
  type:         inv.type,
  contact:      inv.contact_name,
  contactId:    inv.contact_id,
  date:         inv.date,
  currency:     inv.currency,
  exchangeRate: inv.exchange_rate,
  amountsAre:   inv.amounts_are,
  reference:    inv.reference,
  status:       inv.status,
  subtotal:     parseFloat(inv.subtotal),
  taxTotal:     parseFloat(inv.tax_total),
  total:        parseFloat(inv.total),
  notes:        inv.notes,
  items:        lines.map(l => ({
    id:          l.id,
    item:        l.item,
    desc:        l.description,
    qty:         parseFloat(l.qty),
    price:       parseFloat(l.price),
    account:     l.account_val,
    tax:         l.tax_name,
    taxRate:     parseFloat(l.tax_rate),
    amount:      parseFloat(l.amount),
  })),
  historyNotes: notes.map(n => ({
    date:   n.created_at,
    user:   n.user_name,
    action: n.action,
    detail: n.detail,
  })),
  createdAt: inv.created_at,
  updatedAt: inv.updated_at,
});

// GET /api/companies/:companyId/invoices?type=sales|purchase&status=&search=
router.get("/", async (req, res, next) => {
  try {
    const { type, status, search } = req.query;
    let q = "SELECT * FROM invoices WHERE company_id=$1";
    const p = [req.companyId];
    if (type)   { q += ` AND type=$${p.length+1}`;                  p.push(type); }
    if (status) { q += ` AND status=$${p.length+1}`;                p.push(status); }
    if (search) { q += ` AND (invoice_no ILIKE $${p.length+1} OR contact_name ILIKE $${p.length+1})`; p.push(`%${search}%`); }
    q += " ORDER BY date DESC, created_at DESC";
    const { rows } = await db.query(q, p);
    res.json(rows.map(r => fmtInvoice(r)));
  } catch (err) { next(err); }
});

// GET /api/companies/:companyId/invoices/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows: [inv] } = await db.query(
      "SELECT * FROM invoices WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    const { rows: lines } = await db.query(
      "SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY sort_order", [inv.id]);
    const { rows: notes } = await db.query(
      "SELECT * FROM invoice_notes WHERE invoice_id=$1 ORDER BY created_at", [inv.id]);
    res.json(fmtInvoice(inv, lines, notes));
  } catch (err) { next(err); }
});

// POST /api/companies/:companyId/invoices
router.post("/", async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { type, invoiceNo, contact, contactId, date, currency, exchangeRate,
            amountsAre, reference, status, items=[], historyNotes=[] } = req.body;

    const subtotal = items.reduce((a,i) => a + (parseFloat(i.amount)||0), 0);

    const { rows:[inv] } = await client.query(`
      INSERT INTO invoices (company_id,type,invoice_no,contact_id,contact_name,date,currency,
        exchange_rate,amounts_are,reference,status,subtotal,total,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13) RETURNING *`,
      [req.companyId, type, invoiceNo, contactId||null, contact, date, currency||"USD",
       exchangeRate||1, amountsAre||"Tax Exclusive", reference||null, status||"Draft",
       subtotal, req.user.id]);

    // Lines
    for (let i=0; i<items.length; i++) {
      const it = items[i];
      await client.query(`
        INSERT INTO invoice_lines (invoice_id,sort_order,item,description,qty,price,account_val,tax_name,tax_rate,amount)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [inv.id, i, it.item||"", it.desc||"", it.qty||1, it.price||0,
         it.account||"", it.tax||"", it.taxRate||0, it.amount||0]);
    }

    // History notes
    const initNote = { user_name: req.user.name, action: "Created",
      detail: `${invoiceNo} created for ${contact}` };
    const allNotes = [initNote, ...historyNotes];
    for (const n of allNotes) {
      await client.query(`INSERT INTO invoice_notes (invoice_id,user_name,action,detail) VALUES ($1,$2,$3,$4)`,
        [inv.id, n.user||n.user_name||req.user.name, n.action||"Note", n.detail||""]);
    }

    await client.query("COMMIT");
    res.status(201).json(fmtInvoice(inv));
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return res.status(409).json({ error: "Invoice number already exists" });
    next(err);
  } finally { client.release(); }
});

// PUT /api/companies/:companyId/invoices/:id
router.put("/:id", async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { contact, contactId, date, currency, exchangeRate, amountsAre,
            reference, status, items=[], historyNotes=[] } = req.body;

    const subtotal = items.reduce((a,i) => a + (parseFloat(i.amount)||0), 0);

    const { rows:[inv] } = await client.query(`
      UPDATE invoices SET contact_id=$1,contact_name=$2,date=$3,currency=$4,exchange_rate=$5,
        amounts_are=$6,reference=$7,status=$8,subtotal=$9,total=$9,updated_at=NOW()
      WHERE id=$10 AND company_id=$11 RETURNING *`,
      [contactId||null, contact, date, currency, exchangeRate||1, amountsAre,
       reference, status, subtotal, req.params.id, req.companyId]);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    // Replace lines
    await client.query("DELETE FROM invoice_lines WHERE invoice_id=$1", [inv.id]);
    for (let i=0; i<items.length; i++) {
      const it = items[i];
      await client.query(`INSERT INTO invoice_lines (invoice_id,sort_order,item,description,qty,price,account_val,tax_name,amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [inv.id, i, it.item||"", it.desc||"", it.qty||1, it.price||0, it.account||"", it.tax||"", it.amount||0]);
    }

    // Append new notes
    for (const n of historyNotes) {
      await client.query(`INSERT INTO invoice_notes (invoice_id,user_name,action,detail) VALUES ($1,$2,$3,$4)`,
        [inv.id, req.user.name, n.action||"Note", n.detail||""]);
    }

    await client.query("COMMIT");
    res.json(fmtInvoice(inv));
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally { client.release(); }
});

// PATCH /api/companies/:companyId/invoices/:id/status
router.patch("/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;
    const { rows:[inv] } = await db.query(
      "UPDATE invoices SET status=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *",
      [status, req.params.id, req.companyId]);
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    await db.query(`INSERT INTO invoice_notes (invoice_id,user_name,action,detail) VALUES ($1,$2,$3,$4)`,
      [inv.id, req.user.name, "Status Changed", `Status updated to ${status}`]);
    res.json(fmtInvoice(inv));
  } catch (err) { next(err); }
});

// DELETE /api/companies/:companyId/invoices/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM invoices WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    res.json({ message: "Invoice deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
