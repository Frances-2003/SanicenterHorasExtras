import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { isEmulatorMode, isRealFirebaseEnabled, LOCAL_FIREBASE } from "./emulator-config";

const firebaseConfig =
  isEmulatorMode || !isRealFirebaseEnabled
    ? {
        apiKey: "demo-sanicenter-local-key",
        authDomain: "demo-sanicenter.firebaseapp.com",
        projectId: isEmulatorMode ? LOCAL_FIREBASE.projectId : "demo-sanicenter-disabled",
        appId: "demo-sanicenter-local-app",
      }
    : {
        apiKey: import.meta.env["VITE_FIREBASE_API_KEY"],
        authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"],
        projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"],
        appId: import.meta.env["VITE_FIREBASE_APP_ID"],
      };

if (!isEmulatorMode && isRealFirebaseEnabled && firebaseConfig.projectId !== "sanicenterdb")
  throw new Error("Proyecto Firebase real distinto del autorizado.");
const appName = isEmulatorMode
  ? "sanicenter-emulator"
  : isRealFirebaseEnabled
    ? "[DEFAULT]"
    : "sanicenter-disabled";
const existingApp = getApps().find((candidate) => candidate.name === appName);
export const app = existingApp ? getApp(appName) : initializeApp(firebaseConfig, appName);

export const firebaseAuth = getAuth(app);
export const db = getFirestore(app);
if (isEmulatorMode && !existingApp) {
  connectAuthEmulator(firebaseAuth, `http://${LOCAL_FIREBASE.authHost}`, { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
}
