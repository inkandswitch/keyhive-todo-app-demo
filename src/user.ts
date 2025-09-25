import { Individual, Keyhive } from "@keyhive/keyhive";
import { KeyhiveNetworkAdapter } from "@automerge/automerge-keyhive-network-adapter";
import { SyncServer } from "@automerge/rootstock-identity";
import { Active } from "@automerge/rootstock-identity";
import { StorageAdapterInterface } from "@automerge/react";

export type AccessString = "admin" | "write" | "read" | "pull";

export type AppData = {
  individual: Individual;
  active: Active;
  keyhive: Keyhive;
  keyhiveNetworkAdapter: KeyhiveNetworkAdapter;
  db: StorageAdapterInterface;
  syncServer: SyncServer;
};

