import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

function FatalError({ error }) {
  return (
    <main className="min-h-screen bg-fs-cream text-fs-ink p-6">
      <div className="max-w-2xl mx-auto bg-white border border-red-200 rounded-2xl p-5 shadow-soft">
        <h1 className="text-xl font-bold text-red-700 mb-2">Scheduler Failed To Start</h1>
        <p className="text-sm text-fs-muted mb-3">Check browser console for details.</p>
        <pre className="text-xs whitespace-pre-wrap bg-red-50 border border-red-200 rounded-xl p-3 overflow-auto">
          {String(error?.stack || error?.message || error)}
        </pre>
      </div>
    </main>
  );
}

try {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Boot error:", error);
  createRoot(document.getElementById("root")).render(<FatalError error={error} />);
}

window.addEventListener("error", (e) => {
  console.error("Global runtime error:", e.error || e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
});
