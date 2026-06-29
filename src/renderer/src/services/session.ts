import { getAll, getById, createItem, updateItem, deleteItem } from ".";
import type { Session } from "../../../types";

export const getAllSession = () => getAll<Session>("/api/sessions");
export const getSessionById = (id: string) => getById<Session>("/api/sessions/" + id);
export const createSession = (session: Session) => createItem("/api/sessions", session);
export const updateSession = (session: Session) =>
  updateItem<Session>("/api/sessions/" + session.id, { ...session, lastUpdated: Date.now() });
export const deleteSession = (id: string) => deleteItem("/api/sessions/" + id);
