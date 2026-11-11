import { getFirestore } from "firebase-admin/firestore";
import { initializeRuntime } from "../server/runtime";
import { prepareCompensationCounter } from "../server/compensation-counter";

const apply = process.argv.includes("--apply");
if (
  process.env["WORKFLOW_EMULATOR_MODE"] !== "1" &&
  apply &&
  process.env["PRODUCTION_MAINTENANCE_APPROVED"] !== "create-compensations-counter-only"
)
  throw new Error(
    "Aplicación real bloqueada: se necesita autorización explícita y ventana sin escritores.",
  );
await initializeRuntime();
console.log(JSON.stringify(await prepareCompensationCounter(getFirestore(), apply, true)));
