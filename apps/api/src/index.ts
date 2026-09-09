import { config, validate } from "@caddy-manager/config";
import { buildApp } from "./app.js";
import { closeDb } from "./lib/db.js";
import { startSiteHealthJob, stopSiteHealthJob } from "./jobs/siteHealth.js";

validate();

const start = async () => {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    startSiteHealthJob();
  } catch (err) {
    app.log.error(err);
    await closeDb();
    process.exit(1);
  }
};

start();
