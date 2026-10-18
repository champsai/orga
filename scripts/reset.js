// Restore the demo data (vendors, example events, conversations).
import { reset } from "../lib/store.js";
reset();
console.log("Demo data restored to data/db.json");
