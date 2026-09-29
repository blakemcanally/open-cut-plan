import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { createOptimizerWorker } from "./optimizer/useOptimizer.ts";
import { openStorage, unavailableStorage } from "./storage/db.ts";
import "./styles.css";

const storage = await openStorage().catch((error: unknown) =>
  unavailableStorage(`this browser has no project storage: ${error instanceof Error ? error.message : String(error)}`),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App storage={storage} workerFactory={createOptimizerWorker} />
  </StrictMode>,
);
