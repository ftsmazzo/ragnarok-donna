import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

/** Evita múltiplos pools por hot-reload / imports repetidos (Next.js). */
const globalForDb = globalThis as typeof globalThis & {
  __postgresClient?: ReturnType<typeof postgres>;
  __drizzleDb?: Db;
};

const poolMax = Math.max(1, Number(process.env.DATABASE_POOL_MAX ?? 3));

function getClient(connectionString: string) {
  if (!globalForDb.__postgresClient) {
    globalForDb.__postgresClient = postgres(connectionString, {
      max: poolMax,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalForDb.__postgresClient;
}

/** Pool único por processo — não chame `postgres()` fora daqui no app. */
export function createDb(connectionString = process.env.DATABASE_URL!): Db {
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada");
  }
  if (!globalForDb.__drizzleDb) {
    globalForDb.__drizzleDb = drizzle(getClient(connectionString), { schema });
  }
  return globalForDb.__drizzleDb;
}

export { schema };
