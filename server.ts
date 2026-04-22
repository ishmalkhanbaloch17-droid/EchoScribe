import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "node:crypto";
import pg from "pg";
const { Pool } = pg;
import "dotenv/config";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize DB pool
  let pool: any = null;
  let dbError: string | null = null;
  const dbUrl = process.env.POSTGRES_URL;
  const isPlaceholder = !dbUrl || 
                   dbUrl.includes('...') || 
                   dbUrl === 'base' || 
                   dbUrl.includes('//base') || 
                   dbUrl.includes('hostname') ||
                   dbUrl.includes('your-db-url') ||
                   dbUrl.includes('example.com');
  
  if (dbUrl && !isPlaceholder) {
    try {
      pool = new Pool({ 
        connectionString: dbUrl,
        connectionTimeoutMillis: 3000 // Even shorter for better startup speed
      });
      pool.on('error', (err: any) => {
        dbError = err.message;
      });
    } catch (e: any) {
      dbError = e.message;
      pool = null;
    }
  } else if (process.env.POSTGRES_URL) {
    dbError = "Database not configured (using placeholders)";
  }

  // Database Initialization Logic
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS scribe_final_records (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            content TEXT,
            summary TEXT,
            action_items JSONB,
            follow_up_email TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW() NOT NULL
          );
        `);
      } finally {
        client.release();
      }
    } catch (dbInitErr: any) {
      // Intentionally silent - fallback to memoryHistory is handled in endpoints
      pool = null;
      dbError = dbInitErr.message;
    }
  }

  app.use(express.json({ limit: '110mb' }));
  app.use(express.urlencoded({ limit: '110mb', extended: true }));

  // In-memory fallback storage
  let memoryHistory: any[] = [];

  // API Route: Get Meeting History
  app.get("/api/meetings", async (_req, res) => {
    if (!pool) return res.json({ data: memoryHistory });
    try {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT * FROM scribe_final_records ORDER BY created_at DESC LIMIT 10');
        res.json({ data: result.rows });
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("Fetch meetings error:", error);
      res.json({ data: memoryHistory, error: error.message });
    }
  });

  // API Route: Save Processed Meeting
  app.post("/api/save", async (req: any, res: any) => {
    try {
      const { summary, actionItems, followUpEmail, template, originalName } = req.body;
      const userId = "public-user";
      const meetingId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      const newMeeting = {
        id: meetingId,
        user_id: userId,
        summary,
        action_items: actionItems,
        follow_up_email: followUpEmail,
        metadata: { template, originalName },
        created_at: createdAt
      };

      // Add to memory fallback
      memoryHistory = [newMeeting, ...memoryHistory].slice(0, 10);

      // Save to database if pool is provided
      let dbSaved = false;
      let dbSaveError = null;
      if (pool) {
        try {
          const client = await pool.connect();
          try {
            await client.query(
              'INSERT INTO scribe_final_records (id, user_id, summary, action_items, follow_up_email, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
              [meetingId, userId, summary, JSON.stringify(actionItems), followUpEmail, JSON.stringify({ template, originalName })]
            );
            dbSaved = true;
            console.log("Meeting saved to database.");
          } finally {
            client.release();
          }
        } catch (dbErr: any) {
          console.error("DB SAVE ERROR:", dbErr.message);
          dbSaveError = dbErr.message;
        }
      }

      res.json({ status: "success", dbSaved, dbError: dbSaveError, meeting: newMeeting });
    } catch (error: any) {
      console.error("Save error:", error);
      res.status(500).json({ error: error.message || "Failed to save meeting" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
