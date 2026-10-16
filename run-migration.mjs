import pg from "pg";
const { Client } = pg;
const url = "postgres://postgres.shiwnmsbxusfxygbogrb:qHjzPmUgB4JjTfhH@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require";
const fs = await import("node:fs");
const sql = fs.readFileSync("/Users/masterdee/horse-racing-clone/supabase-migration.sql","utf8");
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectTimeoutMS: 15000 });
await c.connect();
const queries = sql.split(/;\s*\n/).filter(q=>q.trim());
for (const q of queries) {
  await c.query(q + ";");
}
console.log("MIGRATION OK");
await c.end();
