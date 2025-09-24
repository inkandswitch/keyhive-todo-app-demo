import { Individual, Keyhive } from "@keyhive/keyhive";
import { StateDB } from "@automerge/rootstock-identity";
import { KeyhiveNetworkAdapter } from "@automerge/automerge-keyhive-network-adapter";
import { SyncServer } from "@automerge/rootstock-identity";
import { Active } from "@automerge/rootstock-identity";


// export type Active = {
//   keyPair: CryptoKeyPair;
//   // FIXME: Right now we need to overwrite this on rehydration
//   individual: Individual | null;
//   // FIXME: Right now we need to overwrite this on rehydration
//   contactCard: string | null; // JSON string of ContactCard
//   // FIXME: Right now we need to overwrite this on rehydration
//   signer: Signer;
//   user: User;
// };

export type AccessString = "admin" | "write" | "read" | "pull";

export type AppData = {
  individual: Individual;
  active: Active;
  keyhive: Keyhive;
  keyhiveNetworkAdapter: KeyhiveNetworkAdapter;
  db: StateDB<Active>;
  syncServer: SyncServer;
};

// export async function loadOrGenerateActive(
//   db: StateDB<Active>,
// ): Promise<Active> {
//   let active: Active;

//   const maybeActive = await db.load();
//   if (maybeActive) {
//     active = maybeActive;
//     const signer = await Signer.webCryptoSigner(active.keyPair);
//     active.signer = signer;
//   } else {
//     try {
//       const keyPair = await crypto.subtle.generateKey(
//         {
//           name: "Ed25519",
//         },
//         true,
//         ["sign", "verify"],
//       );
//       const signer = await Signer.webCryptoSigner(keyPair);

//       active = {
//         individual: null,
//         contactCard: null,
//         signer: signer,
//         keyPair: keyPair,
//         user: {
//           peerId: peerIdFromSigner(signer),
//           name: undefined,
//           avatar: null,
//         },
//       };
//       db.store(active);
//     } catch (error) {
//       console.error("Error creating signer: ", error);
//       throw error;
//     }
//   }
//   return active;
// }
