/**
 * One-time script: import SBI statement June 2026 directly into MongoDB.
 * Run: node scripts/import-sbi-june2026.mjs
 *
 * Reads MONGODB_URI from .env.local automatically.
 */

import { MongoClient, ObjectId } from "mongodb";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// Parse .env.local
const envPath = resolve(__dir, "../.env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const URI = env.MONGODB_URI;
if (!URI) { console.error("MONGODB_URI not found in .env.local"); process.exit(1); }

// ── All 71 transactions from SBI statement 01-06-2026 to 21-06-2026 ──
const transactions = [
  // type: "expense" = money out (debit), "credit" = money in
  { date:"2026-06-01", name:"Amazon",            amount:1504.00, type:"expense", category:"Shopping",       note:"UPI amazon@rap" },
  { date:"2026-06-02", name:"Aditya S (Rent)",   amount:7000.00, type:"credit",  category:"Other",          note:"UPI 8208584349/rent" },
  { date:"2026-06-02", name:"Govind N",           amount:20.00,   type:"expense", category:"Other",          note:"UPI paytmqr6p9" },
  { date:"2026-06-03", name:"Groww",              amount:5500.00, type:"expense", category:"Other",          note:"Investment - groww.brk" },
  { date:"2026-06-03", name:"Euronet Recharge",   amount:349.00,  type:"expense", category:"Utilities",      note:"Mobile recharge gpayrechar" },
  { date:"2026-06-03", name:"Jayesh N",           amount:100.00,  type:"credit",  category:"Other",          note:"UPI 9665492118" },
  { date:"2026-06-03", name:"Kartikey",           amount:120.00,  type:"credit",  category:"Other",          note:"UPI 6392463266" },
  { date:"2026-06-03", name:"Salary (CEMTEX)",    amount:5000.00, type:"credit",  category:"Other",          note:"Salary credit" },
  { date:"2026-06-04", name:"Ravindra",           amount:5000.00, type:"credit",  category:"Other",          note:"UPI CNRB 9623269447" },
  { date:"2026-06-04", name:"The Chaa",           amount:140.00,  type:"expense", category:"Food",           note:"UPI vyapar.175" },
  { date:"2026-06-05", name:"Arpit AR",           amount:200.00,  type:"expense", category:"Other",          note:"UPI arpitarunr" },
  { date:"2026-06-05", name:"BusyBees",           amount:649.31,  type:"expense", category:"Shopping",       note:"POS pinelabs.1" },
  { date:"2026-06-05", name:"Sudhir K",           amount:10.00,   type:"expense", category:"Other",          note:"bharatpe.9" },
  { date:"2026-06-05", name:"Ravindra",           amount:5000.00, type:"credit",  category:"Other",          note:"UPI CNRB 9623269447" },
  { date:"2026-06-05", name:"Mr Ankus",           amount:1.62,    type:"expense", category:"Other",          note:"bharatpe.9 FDRL" },
  { date:"2026-06-05", name:"Jay Malhotra",       amount:30.00,   type:"expense", category:"Other",          note:"UPI q984197682" },
  { date:"2026-06-05", name:"Rohit MI",           amount:20.00,   type:"expense", category:"Other",          note:"UPI q120528938" },
  { date:"2026-06-06", name:"Kartikey",           amount:80.00,   type:"expense", category:"Other",          note:"UPI 6392463266" },
  { date:"2026-06-06", name:"BusyBees",           amount:578.69,  type:"expense", category:"Shopping",       note:"POS pinelabs.1" },
  { date:"2026-06-06", name:"Ganesh N",           amount:14000.00,type:"expense", category:"Other",          note:"UPI crystalpg1 - likely PG/Rent" },
  { date:"2026-06-07", name:"Paushtik",           amount:20.00,   type:"expense", category:"Food",           note:"UPI paytmqr1jq" },
  { date:"2026-06-07", name:"Shree SW",           amount:400.00,  type:"expense", category:"Other",          note:"UPI q516950041" },
  { date:"2026-06-07", name:"Kiran BA",           amount:137.00,  type:"expense", category:"Other",          note:"UPI paytm.s20r" },
  { date:"2026-06-07", name:"Arpita",             amount:50.00,   type:"credit",  category:"Other",          note:"UPI arpita.bha" },
  { date:"2026-06-07", name:"Bhalerao",           amount:25.00,   type:"credit",  category:"Other",          note:"UPI bhaleraosh" },
  { date:"2026-06-07", name:"Kartikey",           amount:133.00,  type:"credit",  category:"Other",          note:"UPI 6392463266" },
  { date:"2026-06-07", name:"Kartikey",           amount:37.00,   type:"credit",  category:"Other",          note:"UPI 6392463266" },
  { date:"2026-06-07", name:"Arpita",             amount:140.00,  type:"credit",  category:"Other",          note:"UPI arpita.bha" },
  { date:"2026-06-07", name:"Arpita",             amount:7.00,    type:"expense", category:"Other",          note:"UPI arpita.bha" },
  { date:"2026-06-08", name:"Chaitanya",          amount:50.00,   type:"credit",  category:"Other",          note:"UPI cheturawat/pool" },
  { date:"2026-06-08", name:"Dwij Vil",           amount:50.00,   type:"credit",  category:"Other",          note:"UPI dwijnaranj" },
  { date:"2026-06-08", name:"Ms Sunit",           amount:120.00,  type:"expense", category:"Other",          note:"UPI q137808607" },
  { date:"2026-06-10", name:"Pratham",            amount:125.00,  type:"expense", category:"Other",          note:"UPI yespay.ypb" },
  { date:"2026-06-11", name:"Madhav S",           amount:100.00,  type:"expense", category:"Other",          note:"UPI somanimadh" },
  { date:"2026-06-11", name:"Aditya S",           amount:431.75,  type:"expense", category:"Other",          note:"UPI adityadhag" },
  { date:"2026-06-11", name:"Miss Anu",           amount:15.00,   type:"expense", category:"Other",          note:"UPI anushkatiw" },
  { date:"2026-06-11", name:"Chaitanya",          amount:62.50,   type:"expense", category:"Other",          note:"UPI cheturawat" },
  { date:"2026-06-11", name:"Aditya S",           amount:50.00,   type:"expense", category:"Other",          note:"UPI adityadhag" },
  { date:"2026-06-11", name:"Euronet Recharge",   amount:900.90,  type:"expense", category:"Utilities",      note:"Mobile recharge gpayrechar" },
  { date:"2026-06-12", name:"Zerodha",            amount:1.00,    type:"expense", category:"Other",          note:"zerodhabro - Investment test" },
  { date:"2026-06-12", name:"Zerodha",            amount:1.00,    type:"credit",  category:"Other",          note:"zerodhabro - Returned" },
  { date:"2026-06-12", name:"Kartikey",           amount:120.00,  type:"credit",  category:"Other",          note:"UPI 6392463266" },
  { date:"2026-06-12", name:"Yogeshwar",          amount:222.00,  type:"expense", category:"Other",          note:"UPI yespay.biz" },
  { date:"2026-06-12", name:"Abhishek",           amount:50.00,   type:"expense", category:"Other",          note:"UPI 7499356892" },
  { date:"2026-06-12", name:"Eleven Park",        amount:40.00,   type:"expense", category:"Other",          note:"UPI 2518662309" },
  { date:"2026-06-12", name:"Vallabh",            amount:20.00,   type:"credit",  category:"Other",          note:"UPI vallabhtup" },
  { date:"2026-06-12", name:"Mr Ankus",           amount:479.24,  type:"expense", category:"Other",          note:"bharatpe.9 FDRL" },
  { date:"2026-06-13", name:"Vallabh",            amount:20.00,   type:"credit",  category:"Other",          note:"UPI vallabhtup" },
  { date:"2026-06-13", name:"Shankar",            amount:40.00,   type:"expense", category:"Other",          note:"UPI q799773130" },
  { date:"2026-06-13", name:"Kedar MA",           amount:20.00,   type:"credit",  category:"Other",          note:"UPI kedarmshar" },
  { date:"2026-06-14", name:"Shankar",            amount:20.00,   type:"expense", category:"Other",          note:"UPI q799773130" },
  { date:"2026-06-14", name:"Xpanse",             amount:61.95,   type:"expense", category:"Travel",         note:"Airport - xpansewov (1 of 2)" },
  { date:"2026-06-14", name:"Xpanse",             amount:61.95,   type:"expense", category:"Travel",         note:"Airport - xpansewov (2 of 2)" },
  { date:"2026-06-14", name:"Anushka",            amount:62.00,   type:"credit",  category:"Other",          note:"UPI 7774069280" },
  { date:"2026-06-15", name:"Tushar K",           amount:50.00,   type:"expense", category:"Other",          note:"UPI 8249854849" },
  { date:"2026-06-15", name:"Ashabai",            amount:60.00,   type:"expense", category:"Other",          note:"UPI q531544471" },
  { date:"2026-06-16", name:"Shankar",            amount:10.00,   type:"expense", category:"Other",          note:"UPI q354763399" },
  { date:"2026-06-16", name:"Surekha",            amount:150.00,  type:"expense", category:"Other",          note:"UPI q081472744" },
  { date:"2026-06-16", name:"Pratham",            amount:70.00,   type:"expense", category:"Other",          note:"UPI yespay.ypb" },
  { date:"2026-06-17", name:"Jooli",              amount:100.00,  type:"expense", category:"Other",          note:"UPI punatayars" },
  { date:"2026-06-17", name:"Gokhana Food",       amount:75.00,   type:"expense", category:"Food",           note:"UPI gokhana.pa" },
  { date:"2026-06-17", name:"Reliance",           amount:564.19,  type:"credit",  category:"Other",          note:"IMPS ICN-XX554-RELIANCE" },
  { date:"2026-06-18", name:"Aditya S",           amount:372.00,  type:"credit",  category:"Other",          note:"UPI adityadhag" },
  { date:"2026-06-18", name:"Aditya S",           amount:372.00,  type:"expense", category:"Other",          note:"UPI adityadhag - returned same day" },
  { date:"2026-06-18", name:"Pratham E",          amount:55.00,   type:"expense", category:"Travel",         note:"Airport - pbhopale10" },
  { date:"2026-06-18", name:"Steam (Valve)",      amount:309.00,  type:"expense", category:"Entertainment",  note:"valvecorpo - Steam purchase" },
  { date:"2026-06-19", name:"Jayesh N",           amount:102.00,  type:"expense", category:"Other",          note:"UPI 9665492118" },
  { date:"2026-06-20", name:"Ravindra",           amount:5000.00, type:"credit",  category:"Other",          note:"UPI CNRB 9623269447" },
  { date:"2026-06-20", name:"Pradip B",           amount:200.00,  type:"expense", category:"Other",          note:"UPI paytm.s1wx" },
  { date:"2026-06-20", name:"Shankar",            amount:40.00,   type:"expense", category:"Other",          note:"UPI q354763399" },
  { date:"2026-06-21", name:"Asha Kumar",         amount:50.00,   type:"expense", category:"Other",          note:"UPI paytm.s1wx" },
];

async function run() {
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db("habit_ledger");
  const col = db.collection("expenses");

  const docs = transactions.map(t => ({
    _id: new ObjectId(),
    date: t.date,
    name: t.name,
    amount: t.amount,
    type: t.type,
    category: t.category,
    note: t.note,
    created_at: new Date().toISOString(),
  }));

  const result = await col.insertMany(docs);
  console.log(`✓ Inserted ${result.insertedCount} transactions into habit_ledger.expenses`);

  const debits  = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const credits = transactions.filter(t => t.type === "credit" ).reduce((s, t) => s + t.amount, 0);
  console.log(`  Total debits:  ₹${debits.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
  console.log(`  Total credits: ₹${credits.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);

  await client.close();
}

run().catch(e => { console.error(e); process.exit(1); });
