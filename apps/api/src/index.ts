import { config, validate } from "@caddy-manager/config";
import { buildApp } from "./app.js";
import { closeDb } from "./lib/db.js";
import {
  runSiteHealthCycle,
  startSiteHealthJob,
  stopSiteHealthJob,
} from "./jobs/siteHealth.js";

validate();

const start = async () => {
  const app = await buildApp();

  try {
    app.log.info(
      {
        port: config.port,
        logLevel: config.logLevel,
        logFile: config.logFile,
        siteHealthEnabled: config.siteHealthEnabled,
        siteCheckCron: config.siteCheckCron,
        caddyAllowedHosts: config.caddyAllowedHosts,
      },
      "Starting Caddy Manager API",
    );
    await app.listen({ port: config.port, host: "0.0.0.0" });

    if (config.siteHealthEnabled) {
      app.log.info("API is listening; running initial site health checks");
      try {
        await runSiteHealthCycle();
        app.log.info("Initial site health cycle completed");
      } catch (error) {
        app.log.error({ err: error }, "Initial site health cycle failed");
      }
    } else {
      app.log.info("Initial site health checks disabled by configuration");
    }

    startSiteHealthJob();
    app.log.info("Startup sequence completed");
  } catch (err) {
    app.log.error(err);
    await closeDb();
    process.exit(1);
  }
};

start();
