import { createDb } from "@/db";

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL não configurada");
    }
    _db = createDb(url);
  }
  return _db;
}
