import ReactDOM from "react-dom/client";
import "./index.css";
import { Repo, DocHandle } from "@automerge/react/slim";
import { KeyhiveKit } from "@patchwork/identity";
import { Keyhive } from "@keyhive/keyhive/slim";
import Frame, { TemporaryAccountInterface } from "./components/Frame.tsx";

declare global {
  interface Window {
    keyhive: Keyhive,
  }
}

export const plugins = [
  {
    type: "patchwork:tool",
    id: "keyhive-todo-demo",
    name: "Keyhive TODO Demo",
    supportedDataTypes: ["identity"],
    async load() {
      return {
        render({
          element,
          handle,
          repo,
          keyhiveKit,
        }: {
          element: HTMLElement;
          handle: DocHandle<TemporaryAccountInterface>;
          repo: Repo;
          keyhiveKit: KeyhiveKit;
        }) {
          console.log("[Demo] Startup");
          const root = ReactDOM.createRoot(element);
          window.keyhive = keyhiveKit.keyhive;

          root.render(
            <Frame
              accountHandle={handle}
              keyhiveKit={keyhiveKit}
              repo={repo}
            />,
          );
          return () => root.unmount();
        },
      };
    },
  },
];
