import { Database } from "bun:sqlite";

// Diagnostic generator, not part of the CLI's five subcommands - same
// spirit as genGateConsistentSample.ts. Builds a small, entirely fake
// client-record fixture standing in for a real CRM/practice-management
// database (the columns below are a deliberately small subset of a real
// system's schema, picked because they're the ones the "AI collation" step
// (ui/src/lib/derive*.ts) can actually use - see docs/20260818_browser-ui-
// mwe-plan.md's follow-up notes). Authored with Bun's native bun:sqlite so
// the root project needs no new dependency just to *write* this fixture;
// the browser reads it back with sql.js (a WASM SQLite build), the only
// place a SQLite engine needs to run client-side.
//
// CentrelinkReferenceNumber note: real CRNs are 9 characters (8 digits + a
// checksum letter, e.g. "123456789A"), but forms/income-and-assets/
// schema.ts's clientReferenceNumber is validated as exactly 10 digits, no
// letter (a pre-existing detail in that already-committed schema, not
// something this fixture changes). The values below are 10-digit numeric
// strings so the derived business input actually satisfies that schema,
// not because real CRNs look like this.
const OUT_PATH = "fixtures/dummy-clients.sqlite";

const db = new Database(OUT_PATH, { create: true });
db.run("DROP TABLE IF EXISTS clients");
db.run(`
  CREATE TABLE clients (
    id INTEGER PRIMARY KEY,
    FirstName TEXT NOT NULL,
    LastName TEXT NOT NULL,
    MiddleName TEXT,
    DOB TEXT,
    Email TEXT,
    CentrelinkReferenceNumber TEXT,
    Citizenship TEXT,
    EmploymentStatus TEXT
  )
`);

const insert = db.query(
  `INSERT INTO clients
    (FirstName, LastName, MiddleName, DOB, Email, CentrelinkReferenceNumber, Citizenship, EmploymentStatus)
   VALUES ($firstName, $lastName, $middleName, $dob, $email, $crn, $citizenship, $employmentStatus)`,
);

// Deliberately fake people, chosen to exercise different mapping paths in
// the collation step (ui/src/lib/derive*.ts):
//  - Priya: clean case - full-time, citizenship on file, everything maps.
//  - Robert: retired - income-and-assets employment section should not
//    apply at all (employed=false), citizenship still maps.
//  - Amelia: casual worker, no citizenship on file - abs-study's toggle
//    should default off rather than guess a country.
//  - Chen: an EmploymentStatus value the workType lookup doesn't recognize
//    ("Self Employed") - proves the "flag as uncertain, don't silently
//    guess wrong" path actually triggers, not just the confident path.
const clients = [
  {
    firstName: "Priya",
    lastName: "Nandakumar",
    middleName: "Rao",
    dob: "1985-03-12",
    email: "priya.example@example.com",
    crn: "1122334455",
    citizenship: "Australia",
    employmentStatus: "Full Time",
  },
  {
    firstName: "Robert",
    lastName: "Falkirk",
    middleName: null,
    dob: "1958-11-02",
    email: "robert.example@example.com",
    crn: "2233445566",
    citizenship: "Australia",
    employmentStatus: "Retired",
  },
  {
    firstName: "Amelia",
    lastName: "Turnbull",
    middleName: "Grace",
    dob: "1997-07-21",
    email: "amelia.example@example.com",
    crn: "3344556677",
    citizenship: null,
    employmentStatus: "Casual",
  },
  {
    firstName: "Chen",
    lastName: "Wu",
    middleName: null,
    dob: "1979-01-30",
    email: "chen.example@example.com",
    crn: "4455667788",
    citizenship: "New Zealand",
    employmentStatus: "Self Employed",
  },
];

for (const c of clients) {
  insert.run({
    $firstName: c.firstName,
    $lastName: c.lastName,
    $middleName: c.middleName,
    $dob: c.dob,
    $email: c.email,
    $crn: c.crn,
    $citizenship: c.citizenship,
    $employmentStatus: c.employmentStatus,
  });
}

db.close();
console.log(`Wrote ${OUT_PATH} (${clients.length} dummy clients)`);
