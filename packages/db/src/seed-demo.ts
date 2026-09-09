import { queryClient } from "./connection";
import { serverRepo } from "./repositories/server.repository";
import { siteRepo } from "./repositories/site.repository";
import { auditRepo } from "./repositories/audit.repository";

const TAG = "[DEMO]";

async function seedDemo() {
  console.log(`Seeding demo data ${TAG}...`);

  const prodServer = await serverRepo.create({
    name: `Production Caddy ${TAG}`,
    hostname: "caddy-prod.example.com",
    apiEndpoint: "http://caddy-prod:2019",
  });
  await serverRepo.updateStatus(prodServer.id, "online", "v2.8.4");
  console.log(`  Created server: Production Caddy (${prodServer.id})`);

  const stagingServer = await serverRepo.create({
    name: `Staging Caddy ${TAG}`,
    hostname: "caddy-staging.example.com",
    apiEndpoint: "http://caddy-staging:2019",
  });
  await serverRepo.updateStatus(stagingServer.id, "online", "v2.8.4");
  console.log(`  Created server: Staging Caddy (${stagingServer.id})`);

  const sites = await Promise.all([
    siteRepo.create({
      serverId: prodServer.id,
      domain: `app.example.com ${TAG}`,
      upstream: "http://10.0.1.5:3000",
      tlsEnabled: true,
    }),
    siteRepo.create({
      serverId: prodServer.id,
      domain: `api.example.com ${TAG}`,
      upstream: "http://10.0.1.6:8080",
      tlsEnabled: true,
    }),
    siteRepo.create({
      serverId: prodServer.id,
      domain: `admin.example.com ${TAG}`,
      upstream: "http://10.0.1.7:5000",
      tlsEnabled: true,
    }),
    siteRepo.create({
      serverId: stagingServer.id,
      domain: `staging.app.example.com ${TAG}`,
      upstream: "http://10.0.2.5:3000",
      tlsEnabled: false,
    }),
    siteRepo.create({
      serverId: stagingServer.id,
      domain: `staging.api.example.com ${TAG}`,
      upstream: "http://10.0.2.6:8080",
      tlsEnabled: false,
    }),
    siteRepo.create({
      serverId: prodServer.id,
      domain: `fees.munywele.co.ke ${TAG}`,
      upstream: "http://127.0.0.1:9400",
      tlsEnabled: true,
      healthEndpoint: "https://fees.munywele.co.ke/api/health",
      healthHeaders: JSON.stringify({ "x-api-key": crypto.randomUUID() }),
    }),
  ]);

  for (const site of sites) {
    console.log(
      `  Created site: ${site.domain.replace(` ${TAG}`, "")} (${site.id})`,
    );
  }

  await auditRepo.create({
    userId: "admin",
    action: "login",
    entity: "auth",
    details:
      JSON.stringify({ method: "jwt", email: "admin@caddy.local" }) + ` ${TAG}`,
    result: "success",
  });

  await auditRepo.create({
    userId: "admin",
    action: "create",
    entity: "site",
    entityId: sites[0].id,
    details:
      JSON.stringify({
        domain: "app.example.com",
        upstream: "http://10.0.1.5:3000",
      }) + ` ${TAG}`,
    result: "success",
  });

  await auditRepo.create({
    userId: "admin",
    action: "reload",
    entity: "config",
    details: JSON.stringify({ serverId: prodServer.id }) + ` ${TAG}`,
    result: "success",
  });

  await auditRepo.create({
    userId: "admin",
    action: "update",
    entity: "server",
    entityId: prodServer.id,
    details: JSON.stringify({ name: "Production Caddy" }) + ` ${TAG}`,
    result: "success",
  });

  console.log("Demo data seeding complete.");
}

async function purgeDemo() {
  const sql = queryClient;
  await sql`DELETE FROM audit_events WHERE details LIKE ${"%" + TAG + "%"}`;
  await sql`DELETE FROM sites WHERE domain LIKE ${"%" + TAG + "%"}`;
  await sql`DELETE FROM servers WHERE name LIKE ${"%" + TAG + "%"}`;
  console.log(`All ${TAG} records purged.`);
}

const shouldPurge = process.argv.includes("--purge");

if (shouldPurge) {
  purgeDemo().catch((err) => {
    console.error("Purge demo failed:", err);
    process.exit(1);
  });
} else {
  seedDemo().catch((err) => {
    console.error("Seed demo failed:", err);
    process.exit(1);
  });
}
