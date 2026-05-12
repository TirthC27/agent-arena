const { Client } = require("pg");

async function test(url, name) {
  const client = new Client({ 
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    console.log(`✅ SUCCESS: ${name}`);
    await client.end();
  } catch (err) {
    console.log(`❌ FAILED: ${name} -> ${err.message}`);
  }
}

async function run() {
  const pass = "VKTzHE9khlUm10Nm";
  const ref = "zjlqrapzdoujdovixmzx";
  const urls = [
    { name: "Direct (IPv6)", url: `postgresql://postgres:${pass}@db.${ref}.supabase.co:5432/postgres` },
    { name: "Pooler (port 6543)", url: `postgresql://postgres.${ref}:${pass}@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres` },
    { name: "Pooler (port 5432)", url: `postgresql://postgres.${ref}:${pass}@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres` },
    { name: "Pooler no ref (6543)", url: `postgresql://postgres:${pass}@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres` },
    { name: "Pooler no ref (5432)", url: `postgresql://postgres:${pass}@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres` },
  ];

  for (const u of urls) {
    await test(u.url, u.name);
  }
}

run();
