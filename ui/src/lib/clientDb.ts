import initSqlJs, { type Database, type QueryExecResult } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

// The dummy client-record fixture (fixtures/dummy-clients.sqlite, authored
// by scripts/genDummyClientsDb.ts with Bun's native bun:sqlite) stands in
// for a real practice-management database - see docs/20260818_browser-ui-
// mwe-plan.md. Loaded and queried entirely client-side via sql.js (a WASM
// build of real SQLite), the same "no server" boundary as the rest of this
// UI - the fixture never leaves the browser any more than a real client
// database would over a server round-trip we don't have.
const DB_URL = new URL("../../../fixtures/dummy-clients.sqlite", import.meta.url).href;

export interface ClientRecord {
  id: number;
  FirstName: string;
  LastName: string;
  MiddleName: string | null;
  DOB: string | null;
  Email: string | null;
  CentrelinkReferenceNumber: string | null;
  Citizenship: string | null;
  EmploymentStatus: string | null;
}

let dbPromise: Promise<Database> | undefined;

function loadDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const [SQL, response] = await Promise.all([
        initSqlJs({ locateFile: () => sqlWasmUrl }),
        fetch(DB_URL),
      ]);
      if (!response.ok) {
        throw new Error(`failed to fetch ${DB_URL} (${response.status})`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return new SQL.Database(bytes);
    })();
  }
  return dbPromise;
}

function rowsToObjects<T>(result: QueryExecResult[]): T[] {
  const first = result[0];
  if (!first) return [];
  return first.values.map(
    (row) => Object.fromEntries(first.columns.map((col, i) => [col, row[i]])) as T,
  );
}

export async function listClients(): Promise<ClientRecord[]> {
  const db = await loadDb();
  return rowsToObjects<ClientRecord>(db.exec("SELECT * FROM clients ORDER BY id"));
}

export async function getClient(id: number): Promise<ClientRecord | undefined> {
  const db = await loadDb();
  return rowsToObjects<ClientRecord>(db.exec("SELECT * FROM clients WHERE id = ?", [id]))[0];
}
