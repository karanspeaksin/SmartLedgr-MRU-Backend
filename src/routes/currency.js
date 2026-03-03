// src/routes/currency.js — XE.com proxy + manual rate storage
const router = require("express").Router();
const { auth } = require("../middleware/auth");

// Simulated rates (replace with real XE API call when you have a key)
const BASE_RATES = {
  USD:1, INR:83.12, EUR:0.92, GBP:0.79, MRU:46.30,
  AED:3.67, SGD:1.35, AUD:1.53, CAD:1.36, ZAR:18.80, JPY:149.5, CHF:0.89
};

// GET /api/currency/rate?from=USD&to=INR
router.get("/rate", auth, async (req, res, next) => {
  try {
    const { from="USD", to="USD" } = req.query;
    if (from === to) return res.json({ from, to, rate: 1, source: "same-currency" });

    // If XE API credentials exist, call live API
    if (process.env.XE_API_ID && process.env.XE_API_KEY) {
      const response = await fetch(
        `https://xecdapi.xe.com/v1/convert_from.json/?from=${from}&to=${to}&amount=1`,
        { headers: { Authorization: "Basic " + Buffer.from(`${process.env.XE_API_ID}:${process.env.XE_API_KEY}`).toString("base64") } }
      );
      const data = await response.json();
      const rate = data.to?.[0]?.mid;
      if (rate) return res.json({ from, to, rate: parseFloat(rate.toFixed(6)), source: "xe.com" });
    }

    // Fallback to simulated rates
    const fromRate = BASE_RATES[from] || 1;
    const toRate   = BASE_RATES[to]   || 1;
    const rate     = parseFloat((toRate / fromRate).toFixed(6));
    res.json({ from, to, rate, source: "simulated", note: "Add XE_API_ID and XE_API_KEY in .env for live rates" });
  } catch (err) { next(err); }
});

// GET /api/currency/list
router.get("/list", auth, (req, res) => {
  res.json(Object.keys(BASE_RATES));
});

module.exports = router;
