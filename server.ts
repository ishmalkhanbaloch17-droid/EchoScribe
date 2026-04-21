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
                   dbUrl.includes('your-db-url');
  
  if (dbUrl && !isPlaceholder) {
    try {
      pool = new Pool({ 
        connectionString: dbUrl,
        connectionTimeoutMillis: 5000 // Short timeout to fail fast
      });
      // Test the pool immediately to catch host errors early
      pool.on('error', (err: any) => {
        console.error("UNEXPECTED DATABASE POOL ERROR:", err.message);
        dbError = err.message;
      });
    } catch (e: any) {
      console.error("FAILED TO INSTANTIATE DATABASE POOL:", e.message);
      dbError = e.message;
      pool = null;
    }
  } else if (process.env.POSTGRES_URL) {
    console.info("Database: Running in memory-only mode (POSTGRES_URL is not configured).");
    dbError = "Database not configured";
  }

  // Database Initialization Logic
  if (pool) {
    try {
      console.log("Connecting to database...");
      const client = await pool.connect();
      try {
        console.log("Database connection successful.");
        
        // Create standard scribe_final_records table
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
        console.log("scribe_final_records table initialized.");
      } finally {
        client.release();
      }
    } catch (dbInitErr: any) {
      // Quietly handle connection failures during init to avoid noisy logs when config is invalid
      if (dbInitErr.message.includes('getaddrinfo EAI_AGAIN') || dbInitErr.message.includes('ENOTFOUND')) {
        console.info("Database: Connection failed (Hostname unresolved). History will not persist this session.");
      } else {
        console.warn("Database: Connection failed during initialization.", dbInitErr.message);
      }
      pool = null;
      dbError = dbInitErr.message;
    }
  }

  app.use(express.json());

  // API Route: Get Meeting History
  app.get("/api/meetings", async (_req, res) => {
    if (!pool) return res.json({ error: dbError || "Database not configured", data: [] });
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
      res.json({ error: error.message, data: [] });
    }
  });

  // API Route: Save Processed Meeting
  app.post("/api/save", async (req: any, res: any) => {
    try {
      const { summary, actionItems, followUpEmail, template, originalName } = req.body;
      const userId = "public-user";

      // Save to database if pool is provided
      let dbSaveError = null;
      if (pool) {
        try {
          const client = await pool.connect();
          try {
            await client.query(
              'INSERT INTO scribe_final_records (id, user_id, summary, action_items, follow_up_email, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
              [crypto.randomUUID(), userId, summary, JSON.stringify(actionItems), followUpEmail, JSON.stringify({ template, originalName })]
            );
            console.log("Meeting saved using raw SQL successfully.");
          } finally {
            client.release();
          }
        } catch (dbErr: any) {
          console.error("RAW DB SAVE ERROR:", dbErr.message);
          dbSaveError = dbErr.message;
        }
      }

      res.json({ status: "success", dbError: dbSaveError });
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
