import { Active } from "@automerge/automerge-keyhive-network-adapter";
import { Contact } from "./phonebook";

export type Identity = {
  active: Active;
  contact: Contact;
};
