import { queryClient } from "./connection";

async function purge() {
  const sql = queryClient;
  await sql`TRUNCATE TABLE audit_events, sites, servers, users CASCADE`;
  console.log("All tables truncated.");
  await sql.end();
}

purge().catch((err) => {
  console.error("Purge failed:", err);
  process.exit(1);
});
