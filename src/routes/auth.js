// src/routes/auth.js
const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const db      = require("../db");
const { auth } = require("../middleware/auth");

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    const { rows } = await db.query(
      "SELECT * FROM users WHERE email=$1 AND is_active=TRUE", [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: "Invalid email or password" });

    // Get user's companies
    const { rows: companies } = await db.query(`
      SELECT c.*, uc.role as user_role
      FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = $1
      ORDER BY c.name
    `, [user.id]);

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      token,
      user: {
        id:     user.id,
        name:   user.name,
        email:  user.email,
        role:   user.role,
        avatar: user.avatar,
      },
      companies: companies.map(c => ({
        id:         c.id,
        name:       c.name,
        currency:   c.currency,
        symbol:     c.symbol,
        country:    c.country,
        fiscalEnd:  c.fiscal_end,
        taxNo:      c.tax_no,
        cin:        c.cin,
        email:      c.email,
        phone:      c.phone,
        address:    c.address,
        timezone:   c.timezone,
        dateFormat: c.date_format,
        userRole:   c.user_role,
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me — refresh user info
router.get("/me", auth, async (req, res, next) => {
  try {
    const { rows: companies } = await db.query(`
      SELECT c.*, uc.role as user_role FROM companies c
      JOIN user_companies uc ON c.id=uc.company_id WHERE uc.user_id=$1`, [req.user.id]);
    res.json({ user: req.user, companies });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password
router.post("/change-password", auth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { rows } = await db.query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
    if (!(await bcrypt.compare(currentPassword, rows[0].password_hash)))
      return res.status(400).json({ error: "Current password incorrect" });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [hash, req.user.id]);
    res.json({ message: "Password updated" });
  } catch (err) { next(err); }
});

module.exports = router;
