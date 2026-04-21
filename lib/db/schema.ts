import { pgTable, text, timestamp, jsonb, uuid, customType } from "drizzle-orm/pg-core";

/*
// Define a vector type for pgvector if using embeddings
const vector = customType<{ data: number[] }>({
  dataType() {
    return "vector(768)";
  },
});
*/

export const meetings = pgTable("scribe_final_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  content: text("content"),
  summary: text("summary"),
  actionItems: jsonb("action_items"),
  followUpEmail: text("follow_up_email"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
