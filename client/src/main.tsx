import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
import * as Sentry from "@sentry/react";
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [],
  tracesSampleRate: 0.1,
});
