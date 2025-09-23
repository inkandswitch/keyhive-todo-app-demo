import { Archive, CiphertextStore, Keyhive, Signer } from "@keyhive/keyhive";
import { StateDB } from "./db";

export type KeyhiveArchiveBytes = Uint8Array;

export async function loadOrGenerateKeyhive(
  db: StateDB<KeyhiveArchiveBytes>,
  signer: Signer,
  event_handler: (...args: unknown[]) => void,
): Promise<Keyhive> {
  let store = CiphertextStore.newInMemory();

  const maybeKeyhiveBytes = await db.load();
  if (maybeKeyhiveBytes) {
    const archive = new Archive(maybeKeyhiveBytes);
    try {
      console.log("Loading Keyhive archive");
      const keyhive = archive.tryToKeyhive(store, signer, event_handler);
      console.log("Successfully loaded Keyhive from archive");
      return keyhive;
    } catch (error: unknown) {
      const jsError = (error as { toError: () => Error }).toError();
      console.log("Failed to load archive:", jsError.message);
      console.log("Full error:", jsError);
      console.log("Will create new keyhive instead");
    }
  }

  store = CiphertextStore.newInMemory();
  const kh = await Keyhive.init(signer, store, event_handler);
  console.log("Created a new Keyhive");
  db.store(kh.toArchive().toBytes());

  return kh;
}
