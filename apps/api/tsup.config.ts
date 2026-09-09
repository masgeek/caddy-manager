import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  platform: "node",
  clean: true,
  dts: false,
  splitting: false,
  outDir: "dist",

  treeshake: true,
  sourcemap: !options.watch,
  minify: !options.watch,
  minifyWhitespace: !options.watch,
  minifyIdentifiers: !options.watch,
  minifySyntax: !options.watch,

  external: [
    "fastify",
    "@fastify/cors",
    "@fastify/jwt",
    "@fastify/rate-limit",
    "@fastify/sensible",
    "@fastify/swagger",
    "@fastify/swagger-ui",
    "pino",
    "node-cron",
    "zod",
    "zod-to-json-schema",
    "dotenv",
  ],

  // Bundle workspace packages — they have no dist/ output
  noExternal: [/@caddy-manager\//],
}));
