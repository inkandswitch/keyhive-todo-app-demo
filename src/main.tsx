import ReactDOM from "react-dom/client";
import "./index.css";
import { Repo, DocHandle } from "@automerge/react/slim";
import { KeyhiveKit } from "@automerge/rootstock-identity";
import Frame, { TemporaryAccountInterface } from "./components/Frame.tsx";

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
          const root = ReactDOM.createRoot(element);

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
