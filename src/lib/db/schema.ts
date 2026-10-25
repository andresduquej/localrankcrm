import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============================================================
 * Auth (Better Auth + plugin organization)
 * ============================================================ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  metadata: text("metadata"),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

/* ============================================================
 * Dominio (toda tabla lleva organization_id NOT NULL + índice org-first)
 * ============================================================ */

export const contact = pgTable(
  "contact",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contact_org_phone_uq").on(t.organizationId, t.phone),
    index("contact_org_name_idx").on(t.organizationId, t.name),
  ]
);

export const pipelineStage = pgTable(
  "pipeline_stage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    /** open = etapa normal · won / lost = anclas no borrables */
    kind: text("kind", { enum: ["open", "won", "lost"] })
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("stage_org_pos_idx").on(t.organizationId, t.position)]
);

export const lead = pgTable(
  "lead",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    stageId: text("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    position: integer("position").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lead_contact_uq").on(t.contactId),
    index("lead_org_stage_idx").on(t.organizationId, t.stageId, t.position),
  ]
);

export const conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    /** Conversación del Laboratorio: jamás toca la API de WhatsApp. */
    isTest: boolean("is_test").notNull().default(false),
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    handoffAt: timestamp("handoff_at"),
    handoffReason: text("handoff_reason", {
      enum: ["cliente", "modelo", "error", "ventana"],
    }),
    lastInboundAt: timestamp("last_inbound_at"),
    lastMessageAt: timestamp("last_message_at"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Una conversación real por contacto; las de prueba no compiten.
    uniqueIndex("conversation_org_contact_real_uq")
      .on(t.organizationId, t.contactId)
      .where(sql`${t.isTest} = false`),
    index("conversation_org_last_idx").on(t.organizationId, t.lastMessageAt),
  ]
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    /** ID de WhatsApp — UNIQUE (idempotencia). Nullable en salientes de prueba. */
    waMessageId: text("wa_message_id").unique(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    type: text("type").notNull().default("text"),
    text: text("text"),
    status: text("status", {
      enum: ["pending", "sent", "delivered", "read", "failed"],
    })
      .notNull()
      .default("pending"),
    error: text("error"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    waTimestamp: timestamp("wa_timestamp"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("message_org_conv_idx").on(
      t.organizationId,
      t.conversationId,
      t.createdAt
    ),
  ]
);

export const metaCredentials = pgTable(
  "meta_credentials",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    displayPhoneNumber: text("display_phone_number"),
    verifiedName: text("verified_name"),
    tokenCipher: text("token_cipher").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),
    status: text("status", { enum: ["connected", "reconnect_required"] })
      .notNull()
      .default("connected"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meta_credentials_org_uq").on(t.organizationId),
    // El webhook enruta por phone_number_id: debe ser único en la instancia.
    uniqueIndex("meta_credentials_phone_uq").on(t.phoneNumberId),
  ]
);

export const agentProfile = pgTable(
  "agent_profile",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    name: text("name").notNull().default("Asistente"),
    tone: text("tone"),
    instructions: text("instructions"),
    escalationRules: text("escalation_rules"),
    greeting: text("greeting"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_profile_org_uq").on(t.organizationId)]
);

export const kbEntry = pgTable(
  "kb_entry",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["qa", "block"] }).notNull(),
    question: text("question"),
    answer: text("answer"),
    content: text("content"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("kb_org_idx").on(t.organizationId)]
);

export const template = pgTable(
  "template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull(),
    category: text("category").notNull(),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["draft", "pending", "approved", "rejected"],
    })
      .notNull()
      .default("draft"),
    rejectionReason: text("rejection_reason"),
    waTemplateId: text("wa_template_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("template_org_name_lang_uq").on(
      t.organizationId,
      t.name,
      t.language
    ),
  ]
);

export const agentTestRun = pgTable(
  "agent_test_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["running", "done", "failed"] })
      .notNull()
      .default("running"),
    score: integer("score"),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    // Lock de concurrencia en BD: máximo 1 corrida activa por organización.
    uniqueIndex("test_run_org_running_uq")
      .on(t.organizationId)
      .where(sql`${t.status} = 'running'`),
    index("test_run_org_idx").on(t.organizationId, t.startedAt),
  ]
);

export const agentTestCase = pgTable(
  "agent_test_case",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => agentTestRun.id, { onDelete: "cascade" }),
    persona: text("persona").notNull(),
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    transcript: jsonb("transcript"),
    veredicto: text("veredicto", { enum: ["verde", "amarillo", "rojo"] }),
    hallazgos: jsonb("hallazgos"),
    status: text("status", {
      enum: ["pending", "running", "done", "judge_failed"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("test_case_run_idx").on(t.runId)]
);


/* ============================================================
 * CRM Modules (sincronizados con Supabase — multi-dispositivo)
 * ============================================================ */

export const telegramConnection = pgTable(
  "telegram_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" })
      .unique(),
    botUsername: text("bot_username").notNull().default(""),
    tokenCipher: text("token_cipher").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),
    chatId: text("chat_id"),
    chatName: text("chat_name"),
    webhookSecret: text("webhook_secret").notNull(),
    headerSecret: text("header_secret").notNull(),
    digestDate: text("digest_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("telegram_connection_org_idx").on(t.organizationId)]
);

export const appointment = pgTable(
  "appointment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    notes: text("notes").notNull().default(""),
    source: text("source").notNull().default("api"),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("appointment_org_start_idx").on(t.organizationId, t.startsAt)]
);

export const rateLimitHit = pgTable(
  "rate_limit_hit",
  {
    id: text("id").primaryKey(),
    bucketKey: text("bucket_key").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limit_hit_key_at_idx").on(t.bucketKey, t.at)]
);

export const crmContact = pgTable(
  "crm_contact",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    company: text("company").notNull().default(""),
    role: text("role").notNull().default(""),
    image: text("image").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
    tags: jsonb("tags").notNull().default([]),
    customFields: jsonb("custom_fields").notNull().default([]),
    notes: jsonb("notes").notNull().default([]),
    reminders: jsonb("reminders").notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("crm_contact_org_idx").on(t.organizationId),
    index("crm_contact_org_name_idx").on(t.organizationId, t.name),
  ]
);

export const crmTask = pgTable(
  "crm_task",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("pending"),
    dueDate: text("due_date").notNull().default(""),
    assignee: text("assignee").notNull().default(""),
    relatedTo: text("related_to").notNull().default(""),
    category: text("category").notNull().default(""),
    tags: jsonb("tags").notNull().default([]),
    done: boolean("done").notNull().default(false),
    durationMin: integer("duration_min"),
    naggedAt: timestamp("nagged_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("crm_task_org_idx").on(t.organizationId),
    index("crm_task_org_status_idx").on(t.organizationId, t.status),
  ]
);

/**
 * Config de IA por organización (proveedor, key cifrada, modelo) + endpoint
 * de Hermes externo. La key y el PIN se guardan cifrados con AES-256-GCM
 * (mismo patrón que telegram_connection).
 */
export const aiSettings = pgTable(
  "ai_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" })
      .unique(),
    provider: text("provider").notNull().default("openrouter"),
    model: text("model").notNull().default(""),
    baseUrl: text("base_url").notNull().default(""),
    apiKeyCipher: text("api_key_cipher"),
    apiKeyIv: text("api_key_iv"),
    apiKeyTag: text("api_key_tag"),
    hermesEndpoint: text("hermes_endpoint").notNull().default(""),
    hermesPinCipher: text("hermes_pin_cipher"),
    hermesPinIv: text("hermes_pin_iv"),
    hermesPinTag: text("hermes_pin_tag"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ai_settings_org_idx").on(t.organizationId)]
);

/**
 * Bóveda de recursos: repos de GitHub, páginas y herramientas guardados con
 * "para qué sirve" y etiquetas. githubMeta guarda lo que responde la API de
 * GitHub (stars, pushedAt, release) para avisar actualizaciones.
 */
export const vaultItem = pgTable(
  "vault_item",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("pagina"), // repo | pagina | herramienta
    title: text("title").notNull(),
    url: text("url").notNull().default(""),
    notes: text("notes").notNull().default(""), // para qué sirve
    tags: jsonb("tags").notNull().default([]),
    githubMeta: jsonb("github_meta"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("vault_item_org_idx").on(t.organizationId),
    index("vault_item_org_type_idx").on(t.organizationId, t.type),
  ]
);

/** Suscripciones Web Push (iPhone/Android/navegador) por organización. */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    keysP256dh: text("keys_p256dh").notNull(),
    keysAuth: text("keys_auth").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("push_subscription_org_idx").on(t.organizationId)]
);

/**
 * Calendarios externos conectados: Google Calendar (vía su URL secreta en
 * formato iCal/ICS, sin OAuth), Calendly y Cal.com (token de API). El token
 * se guarda cifrado con AES-256-GCM.
 */
export const calendarSource = pgTable(
  "calendar_source",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // ics | calendly | calcom
    name: text("name").notNull(),
    url: text("url").notNull().default(""), // solo ics
    tokenCipher: text("token_cipher"),
    tokenIv: text("token_iv"),
    tokenTag: text("token_tag"),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at"),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("calendar_source_org_idx").on(t.organizationId)]
);

/** Eventos traídos de los calendarios externos (upsert por externalId+source). */
export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => calendarSource.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at"),
    location: text("location").notNull().default(""),
    url: text("url").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("calendar_event_org_start_idx").on(t.organizationId, t.startsAt),
    uniqueIndex("calendar_event_source_ext_idx").on(t.sourceId, t.externalId),
  ]
);

export const crmNote = pgTable(
  "crm_note",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    image: text("image").notNull().default(""),
    relatedTo: text("related_to").notNull().default(""),
    category: text("category").notNull().default("General"),
    tags: jsonb("tags").notNull().default([]),
    pinned: boolean("pinned").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("crm_note_org_idx").on(t.organizationId),
  ]
);

/**
 * Proveedores: fuentes de información que el usuario guarda para tener a mano
 * (páginas web, repos de GitHub, resúmenes, links de Instagram…). Se organizan
 * con etiquetas (tags) y estrellas (rating 0–5).
 */
export const crmSupplier = pgTable(
  "crm_supplier",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull().default(""),
    type: text("type").notNull().default("pagina"), // pagina | repo | resumen | instagram | otro
    notes: text("notes").notNull().default(""), // por qué sirve / qué aporta
    tags: jsonb("tags").notNull().default([]),
    rating: integer("rating").notNull().default(0), // 0–5 estrellas
    githubStars: integer("github_stars"), // ⭐ del repo (API pública de GitHub)
    githubPushed: text("github_pushed"), // última actividad del repo (ISO)
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("crm_supplier_org_idx").on(t.organizationId),
    index("crm_supplier_org_type_idx").on(t.organizationId, t.type),
  ]
);
