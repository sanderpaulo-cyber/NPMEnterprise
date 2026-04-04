import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Pares chave/valor genéricos para preferências e flags persistidas pela API.
 * O dashboard usa este espaço para dados partilhados entre operadores.
 */
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().$type<unknown>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
