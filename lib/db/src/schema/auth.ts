import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Utilizadores para autenticação local, LDAP (password_hash nulo) ou futuros IdPs.
 */
export const authUsersTable = pgTable("auth_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  email: text("email").unique(),
  phone: text("phone"),
  department: text("department"),
  jobTitle: text("job_title"),
  /** Observações internas (gestão administrativa). */
  notes: text("notes"),
  /** Emoji(s) para identificação visual no dashboard (texto curto). */
  avatarEmoji: text("avatar_emoji"),
  /** Data URL de imagem (PNG/JPEG/WebP/GIF base64), preferencial face ao emoji. */
  avatarImageUrl: text("avatar_image_url"),
  /** Argon2id ou similar; nulo para contas só LDAP/OAuth. */
  passwordHash: text("password_hash"),
  /** local | ldap | oauth2 | saml — extensível sem migração de enum. */
  authSource: text("auth_source").notNull().default("local"),
  /** DN LDAP, sub OAuth, NameID SAML, etc. */
  externalSubject: text("external_subject"),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuthUser = typeof authUsersTable.$inferSelect;
export type InsertAuthUser = typeof authUsersTable.$inferInsert;
