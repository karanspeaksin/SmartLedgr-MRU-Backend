// src/routes/contacts.js
const router = require("express").Router({ mergeParams: true });
const db     = require("../db");
const { auth, requireCompany } = require("../middleware/auth");

// All routes need auth + company access
router.use(auth, requireCompany);

// GET /api/companies/:companyId/contacts?type=customer|supplier
router.get("/", async (req, res, next) => {
  try {
    const { type, search } = req.query;
    let q = "SELECT * FROM contacts WHERE company_id=$1 AND is_active=TRUE";
    const params = [req.companyId];
    if (type) { q += ` AND type=$${params.length+1}`; params.push(type); }
    if (search) { q += ` AND name ILIKE $${params.length+1}`; params.push(`%${search}%`); }
    q += " ORDER BY name";
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/companies/:companyId/contacts/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM contacts WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ error: "Contact not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/companies/:companyId/contacts
router.post("/", async (req, res, next) => {
  try {
    const { type, name, brn, vat_no, phone, email, address1, address2, city, country, currency } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    if (!["customer","supplier"].includes(type)) return res.status(400).json({ error: "Type must be customer or supplier" });

    // Auto-generate contact ID prefix
    const { rows: existing } = await db.query(
      "SELECT COUNT(*) as cnt FROM contacts WHERE company_id=$1 AND type=$2", [req.companyId, type]);
    const prefix = type === "customer" ? "CUST" : "SUP";
    const seqNo  = String(parseInt(existing[0].cnt) + 1).padStart(3, "0");

    const { rows } = await db.query(`
      INSERT INTO contacts (company_id,type,name,brn,vat_no,phone,email,address1,address2,city,country,currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.companyId, type, name.trim(), brn||null, vat_no||null, phone||null, email||null,
       address1||null, address2||null, city||null, country||null, currency||"USD"]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/companies/:companyId/contacts/:id
router.put("/:id", async (req, res, next) => {
  try {
    const { name, brn, vat_no, phone, email, address1, address2, city, country, currency } = req.body;
    const { rows } = await db.query(`
      UPDATE contacts SET name=$1,brn=$2,vat_no=$3,phone=$4,email=$5,
        address1=$6,address2=$7,city=$8,country=$9,currency=$10,updated_at=NOW()
      WHERE id=$11 AND company_id=$12 RETURNING *`,
      [name, brn, vat_no, phone, email, address1, address2, city, country, currency, req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ error: "Contact not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/companies/:companyId/contacts/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await db.query("UPDATE contacts SET is_active=FALSE WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
    res.json({ message: "Contact deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
