import ReactDOM from "react-dom/client";
import "./index.css";
import { Keyhive } from "@automerge/automerge-repo-keyhive";
import Frame from "./components/Frame.tsx";

declare global {
  interface Window {
    keyhive: Keyhive;
  }
}

export const plugins = [
  {
    type: "patchwork:tool",
    id: "keyhive-todo-demo",
    name: "Keyhive TODO Demo",
    supportedDataTypes: ["identity"],
    async load() {
      return (_handle: any, element: any) => {
        console.log("[Demo] Startup");
        const root = ReactDOM.createRoot(element);
        window.keyhive = element.hive.keyhive;

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
