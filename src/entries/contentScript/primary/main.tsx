import "../../enableDevHmr";
import React from "react";
import ReactDOM from "react-dom/client";
import renderContent from "../renderContent";
import App from "./App";
import { initializeAutocomplete } from "../../../content/macroAutocomplete";
import { initializeCareerAutofill } from "../../../content/careerAutofill";

// Initialize macro autocomplete system
try {
  initializeAutocomplete();
} catch (error) {
  console.error('Failed to initialize autocomplete:', error);
}

// Initialize career form autofill
initializeCareerAutofill().catch((error) => {
  console.error('Failed to initialize career autofill:', error);
});

renderContent(import.meta.PLUGIN_WEB_EXT_CHUNK_CSS_PATHS, (appRoot) => {
  ReactDOM.createRoot(appRoot).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
