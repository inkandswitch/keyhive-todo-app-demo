import { Active } from "@automerge/rootstock-identity";
import { Contact } from "./phonebook";

export type Identity = {
  active: Active;
  contact: Contact;
};
