// src/middleware/auth.js
const jwt = require("jsonwebtoken");
const db  = require("../db");

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request
    const { rows } = await db.query(
      "SELECT id, name, email, role, avatar FROM users WHERE id = $1 AND is_active = TRUE",
      [decoded.userId]
    );
    if (!rows[0]) return res.status(401).json({ error: "User not found" });

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") return res.status(401).json({ error: "Invalid token" });
    if (err.name === "TokenExpiredError") return res.status(401).json({ error: "Token expired" });
    next(err);
  }
};

// Verify user has access to a company
const requireCompany = async (req, res, next) => {
  const companyId = req.params.companyId || req.body.companyId || req.query.companyId;
  if (!companyId) return res.status(400).json({ error: "Company ID required" });

  const { rows } = await db.query(
    "SELECT role FROM user_companies WHERE user_id=$1 AND company_id=$2",
    [req.user.id, companyId]
  );
  if (!rows[0]) return res.status(403).json({ error: "Access denied to this company" });

  req.companyId   = companyId;
  req.companyRole = rows[0].role;
  next();
};

// Admin only
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "Admin" && req.companyRole !== "Admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

module.exports = { auth, requireCompany, requireAdmin };
