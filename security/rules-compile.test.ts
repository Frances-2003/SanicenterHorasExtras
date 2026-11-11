import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";

it("compiles the final rules and denies anonymous financial access without creating users or documents", async () => {
  if (
    process.env["GCLOUD_PROJECT"] !== "demo-sanicenter" ||
    process.env["FIRESTORE_EMULATOR_HOST"] !== "127.0.0.1:8095"
  )
    throw new Error("Solo emulador de seguridad.");
  const environment = await initializeTestEnvironment({
    projectId: "demo-sanicenter",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  try {
    const db = environment.unauthenticatedContext().firestore();
    for (const path of [
      "overtime/__readiness_probe",
      "compensations/__readiness_probe",
      "counters/overtime",
      "calendar/__readiness_probe",
    ])
      await assertFails(getDoc(doc(db, path)));
    expect(environment.projectId).toBe("demo-sanicenter");
  } finally {
    await environment.cleanup();
  }
});
