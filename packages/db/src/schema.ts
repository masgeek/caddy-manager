import {
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

export const servers = pgTable("servers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 100 }).notNull(),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  apiEndpoint: varchar("api_endpoint", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("unknown"),
  version: varchar("version", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
});

export const sites = pgTable(
  "sites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    domain: varchar("domain", { length: 255 }).notNull(),
    upstream: varchar("upstream", { length: 255 }),
    routeId: varchar("route_id", { length: 255 }),
    caddyServerName: varchar("caddy_server_name", { length: 255 }),
    routeConfig: jsonb("route_config"),
    tlsEnabled: boolean("tls_enabled").notNull().default(true),
    synced: boolean("synced").notNull().default(true),
    status: varchar("status", { length: 20 }).notNull().default("inactive"),
    statusDetail: text("status_detail"),
    lastCheckedAt: timestamp("last_checked_at"),
    healthLatencyMs: integer("health_latency_ms"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    healthEndpoint: varchar("health_endpoint", { length: 150 }),
    healthHeaders: text("health_headers"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("sites_server_domain_unique").on(table.serverId, table.domain),
  ],
);

export const siteGroups = pgTable(
  "site_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("site_groups_server_name_unique").on(
      table.serverId,
      table.name,
    ),
  ],
);

export const siteInventory = pgTable(
  "site_inventory",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    serverId: text("server_id").references(() => servers.id, {
      onDelete: "set null",
    }),
    domain: varchar("domain", { length: 255 }).notNull(),
    managementType: varchar("management_type", { length: 20 })
      .notNull()
      .default("dynamic"),
    routeId: varchar("route_id", { length: 255 }),
    caddyServerName: varchar("caddy_server_name", { length: 255 }),
    upstream: varchar("upstream", { length: 255 }),
    routeConfig: jsonb("route_config"),
    tlsEnabled: boolean("tls_enabled").notNull().default(true),
    groupId: text("group_id").references(() => siteGroups.id, {
      onDelete: "set null",
    }),
    state: varchar("state", { length: 20 }).notNull().default("draft"),
    stateDetail: text("state_detail"),
    provisionedSiteId: text("provisioned_site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    provisionAttempts: integer("provision_attempts").notNull().default(0),
    lastProvisionAttemptAt: timestamp("last_provision_attempt_at"),
    provisionedAt: timestamp("provisioned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("site_inventory_server_domain_unique").on(
      table.serverId,
      table.domain,
    ),
  ],
);

export const auditEvents = pgTable("audit_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).notNull().default("admin"),
  action: varchar("action", { length: 20 }).notNull(),
  entity: varchar("entity", { length: 20 }).notNull(),
  entityId: text("entity_id"),
  details: text("details"),
  result: varchar("result", { length: 10 }).notNull().default("success"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: varchar("username", { length: 30 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: varchar("role", { length: 20 }).notNull().default("viewer"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
