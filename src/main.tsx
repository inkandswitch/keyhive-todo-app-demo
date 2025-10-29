import ReactDOM from "react-dom/client";
import "./index.css";
import { Keyhive } from "@keyhive/keyhive/slim";
import Frame from "./components/Frame.tsx";

console.log("Hi! ---------------");

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
      return (handle: any, element: any) => {
        console.log("[Demo] Startup");
        const root = ReactDOM.createRoot(element);
        window.keyhive = handle.hive.keyhive;

        root.render(
          <Frame
            automergeRepoKeyhive={handle.hive}
            repo={handle.repo}
          />,
        );
        return () => root.unmount();
      }
    },
  },
];
