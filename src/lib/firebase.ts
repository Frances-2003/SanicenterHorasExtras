import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import {
  isEmulatorMode,
  isRealFirebaseEnabled,
  realFirebaseConfigurationError,
  LOCAL_FIREBASE,
} from "./emulator-config";
const useRealFirebase = isRealFirebaseEnabled && !realFirebaseConfigurationError;

const firebaseConfig = isEmulatorMode
  ? {
      apiKey: "demo-sanicenter-local-key",
      authDomain: "demo-sanicenter.firebaseapp.com",
      projectId: LOCAL_FIREBASE.projectId,
      appId: "demo-sanicenter-local-app",
    }
  : !useRealFirebase
    ? {
        apiKey: "sanicenter-disabled-key",
        authDomain: "sanicenter-disabled.invalid",
        projectId: "sanicenter-disabled",
        appId: "sanicenter-disabled-app",
      }
    : {
        apiKey: import.meta.env["VITE_FIREBASE_API_KEY"],
        authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"],
        projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"],
        appId: import.meta.env["VITE_FIREBASE_APP_ID"],
      };

const appName = isEmulatorMode
  ? "sanicenter-emulator"
  : useRealFirebase
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
