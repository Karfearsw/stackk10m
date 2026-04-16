import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    integrations: [],
    tracesSampleRate: 0.1,
  });
}

createRoot(document.getElementById("root")!).render(<App />);
