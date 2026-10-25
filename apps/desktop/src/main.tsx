import React from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import App from "./App";
import NotchApp from "./Notch";
import "./styles.css";
import "./cortex-theme.css";

const params = new URLSearchParams(window.location.search);
const notchWindow = params.get("window") === "notch";
if (notchWindow) {
  document.documentElement.dataset.window = "notch";
  document.documentElement.dataset.preview = String(params.get("preview") === "1" || !isTauri());
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {notchWindow ? <NotchApp /> : <App />}
  </React.StrictMode>,
);
