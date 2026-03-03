// scripts/seed.js — Seeds demo data matching the frontend
require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "smartledgr",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "password",
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. Run schema ──────────────────────────────
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await client.query(schema);
    console.log("✓ Schema applied");

    // ── 2. Companies ──────────────────────────────
    const { rows: [c1] } = await client.query(`
      INSERT INTO companies (name, currency, symbol, country, fiscal_end, tax_no, cin, email, phone, address, timezone, date_format)
      VALUES ('TechSlide IT Solutions OPC Pvt Ltd','INR','₹','India','March','GST123456','U72200MH2020OPC123456','finance@techslide.in','+91 98765 43210','Mumbai, Maharashtra, India','Asia/Kolkata','DD/MM/YYYY')
      ON CONFLICT DO NOTHING RETURNING id
    `);
    const { rows: [c2] } = await client.query(`
      INSERT INTO companies (name, currency, symbol, country, fiscal_end, tax_no, cin, email, phone, address, timezone, date_format)
      VALUES ('Global Ventures LLC','USD','$','USA','December','EIN-98-7654321','GV-LLC-2019','accounts@globalventures.com','+1 555-0200','New York, NY, USA','America/New_York','MM/DD/YYYY')
      ON CONFLICT DO NOTHING RETURNING id
    `);
    const comp1 = c1?.id, comp2 = c2?.id;
    console.log("✓ Companies seeded", { comp1, comp2 });
    if (!comp1 || !comp2) { console.log("  ↳ Companies already exist, skipping seed"); await client.query("COMMIT"); return; }

    // ── 3. Users ──────────────────────────────────
    const hash1 = await bcrypt.hash("demo123", 10);
    const { rows: [u1] } = await client.query(`
      INSERT INTO users (name, email, password_hash, role, avatar)
      VALUES ('John Doe','user2@smartledgr.com',$1,'Admin','JD') RETURNING id`, [hash1]);
    const { rows: [u2] } = await client.query(`
      INSERT INTO users (name, email, password_hash, role, avatar)
      VALUES ('Karan Shah','user5@smartledgr.com',$1,'Manager','KS') RETURNING id`, [hash1]);

    await client.query(`INSERT INTO user_companies VALUES ($1,$2,'Admin')`,   [u1.id, comp1]);
    await client.query(`INSERT INTO user_companies VALUES ($1,$2,'Admin')`,   [u1.id, comp2]);
    await client.query(`INSERT INTO user_companies VALUES ($1,$2,'Manager')`, [u2.id, comp1]);
    await client.query(`INSERT INTO user_companies VALUES ($1,$2,'Manager')`, [u2.id, comp2]);
    console.log("✓ Users seeded");

    // ── 4. Accounts (Chart of Accounts) ──────────
    const accs = [
      ["100","Petty Cash","Asset","Exempt",500],
      ["120","Main Business Account","Asset","Exempt",8627217.08],
      ["200","Sales","Revenue","15% VAT on Income",124500],
      ["300","Inventory","Asset","Exempt",15000],
      ["400","Accounts Payable","Liability","Exempt",18240],
      ["410","Accounts Receivable","Asset","Exempt",42105],
      ["429","General Expenses","Expense","15% VAT on Purchase",4200],
      ["600","Rent","Expense","Exempt",12000],
      ["700","Share Capital","Equity","Exempt",5000000],
    ];
    for (const [code,name,type,taxRate,balance] of accs) {
      await client.query(`INSERT INTO accounts (company_id,code,name,type,tax_rate,balance) VALUES ($1,$2,$3,$4,$5,$6)`,
        [comp1,code,name,type,taxRate,balance]);
    }
    console.log("✓ Accounts seeded");

    // ── 5. Taxes ─────────────────────────────────
    const taxes = [
      ["VAT 15% (Sales)","Output",15],
      ["VAT 15% (Purchase)","Input",15],
      ["Zero Rated","Exempt",0],
      ["Exempt","Exempt",0],
    ];
    for (const [name,type,rate] of taxes) {
      await client.query(`INSERT INTO taxes (company_id,name,type,rate) VALUES ($1,$2,$3,$4)`, [comp1,name,type,rate]);
    }
    console.log("✓ Taxes seeded");

    // ── 6. Bank Accounts ─────────────────────────
    const banks = [
      ["Main Business Account","xxxx0193","National Bank","Current","INR",8627217.08],
      ["Operational Savings","xxxx9921","State Bank","Savings","USD",1250000],
      ["Petty Cash Fund","PC-001","Internal","Cash","INR",5000],
    ];
    for (const [name,accountNo,bank,type,currency,balance] of banks) {
      await client.query(`INSERT INTO bank_accounts (company_id,name,account_no,bank,type,currency,balance) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [comp1,name,accountNo,bank,type,currency,balance]);
    }
    console.log("✓ Bank accounts seeded");

    // ── 7. Customers ─────────────────────────────
    const customers = [
      ["Acme Corp","billing@acme.com","+1 555-0101",12400],
      ["Global Tech Ltd","finance@globaltech.io","+1 555-0202",10300],
      ["Vortex Inc","accounts@vortex.com","+1 555-0303",4150],
      ["North Star Partners","billing@northstar.com","+1 555-0404",3150],
    ];
    const custIds = [];
    for (const [name,email,phone,ar] of customers) {
      const { rows:[r] } = await client.query(`INSERT INTO contacts (company_id,type,name,email,phone,ar_balance) VALUES ($1,'customer',$2,$3,$4,$5) RETURNING id`,
        [comp1,name,email,phone,ar]);
      custIds.push(r.id);
    }

    // ── 8. Suppliers ─────────────────────────────
    const suppliers = [
      ["Amazon Web Services","billing@aws.com","+1 800-AWS-001",1450],
      ["Office Depot","accounts@officedepot.com","+1 800-OD-002",240.50],
      ["Corporate Realty","rentals@corprealty.com","+1 800-CR-003",3500],
      ["City Utilities","support@cityutils.gov","+1 800-CITY-04",420],
    ];
    for (const [name,email,phone,ap] of suppliers) {
      await client.query(`INSERT INTO contacts (company_id,type,name,email,phone,ap_balance) VALUES ($1,'supplier',$2,$3,$4,$5)`,
        [comp1,name,email,phone,ap]);
    }
    console.log("✓ Contacts seeded");

    // ── 9. Sales Invoices ─────────────────────────
    const invoiceData = [
      ["INV-0032","Rex Media Group","2024-02-19","Draft",550],
      ["INV-0031","Global Tech Ltd","2024-02-18","Awaiting Payment",8200],
      ["INV-0030","North Star Partners","2024-02-15","Paid",3150],
      ["INV-0029","Vortex Inc","2024-02-10","Overdue",2900],
      ["INV-0028","Acme Corp","2024-02-05","Awaiting Payment",12400],
    ];
    for (const [no,contact,date,status,total] of invoiceData) {
      await client.query(`INSERT INTO invoices (company_id,type,invoice_no,contact_name,date,status,total,currency,created_by) VALUES ($1,'sales',$2,$3,$4,$5,$6,'USD',$7)`,
        [comp1,no,contact,date,status,total,u1.id]);
    }

    // ── 10. Purchase Invoices ─────────────────────
    const billData = [
      ["BILL-0012","Amazon Web Services","2024-02-20","Awaiting Payment",1450],
      ["BILL-0011","Office Depot","2024-02-18","Paid",240.50],
      ["BILL-0010","Corporate Realty","2024-02-15","Draft",3500],
      ["BILL-0009","City Utilities","2024-02-10","Overdue",420],
    ];
    for (const [no,contact,date,status,total] of billData) {
      await client.query(`INSERT INTO invoices (company_id,type,invoice_no,contact_name,date,status,total,currency,created_by) VALUES ($1,'purchase',$2,$3,$4,$5,$6,'USD',$7)`,
        [comp1,no,contact,date,status,total,u1.id]);
    }
    console.log("✓ Invoices seeded");

    // ── 11. Cash Books ────────────────────────────
    const cbData = [
      ["June 2024",8500000,8627217.08,42,"OPEN"],
      ["May 2024",7200000,8500000,128,"Reconciled"],
      ["April 2024",6800000,7200000,95,"Reconciled"],
    ];
    for (const [label,open,close,entries,status] of cbData) {
      await client.query(`INSERT INTO cash_books (company_id,period_label,opening_balance,closing_balance,status,created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [comp1,label,open,close,status,u1.id]);
    }
    console.log("✓ Cash books seeded");

    // ── 12. Journals ─────────────────────────────
    await client.query(`INSERT INTO journals (company_id,journal_no,date,status,method,total_in,created_by) VALUES ($1,'Payroll-14','2026-01-03','PUBLISHED','Accrual and Cash',313000,$2)`,
      [comp1,u2.id]);
    await client.query(`INSERT INTO journals (company_id,journal_no,date,status,method,total_in,created_by) VALUES ($1,'Payroll-13','2025-12-03','PUBLISHED','Accrual and Cash',313000,$2)`,
      [comp1,u2.id]);
    console.log("✓ Journals seeded");

    await client.query("COMMIT");
    console.log("\n✅ Seed complete! Login: user2@smartledgr.com / demo123");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
