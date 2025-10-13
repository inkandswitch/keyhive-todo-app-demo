import { Active } from "@automerge/automerge-repo-keyhive";
import { Contact } from "./phonebook";

export type Identity = {
  active: Active;
  contact: Contact;
};
