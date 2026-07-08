import ReactDOM from "react-dom/client";
import "./index.css";
import { AutomergeRepoKeyhiveRust, MODULE_INSTANCE_ID, isWasmInitialized } from "@automerge/automerge-repo-keyhive";
import Frame from "./components/Frame.tsx";

declare global {
  interface Window {
    hive: AutomergeRepoKeyhiveRust;
  }
}

export const plugins = [
  {
    type: "patchwork:tool",
    id: "keyhive-todo-demo",
    name: "Keyhive TODO Demo",
    supportedDatatypes: ["identity"],
    async load() {
      console.log(`[Demo] Plugin sees module instance: ${MODULE_INSTANCE_ID}, WASM initialized: ${isWasmInitialized()}`);
      return (_handle: any, element: any) => {
        console.log("[Demo] Startup");
        const root = ReactDOM.createRoot(element);
        window.hive = element.hive;

        root.render(
          <Frame
            automergeRepoKeyhive={element.hive}
            repo={element.repo}
          />,
        );
        return () => root.unmount();
      }
    },
  },
];
