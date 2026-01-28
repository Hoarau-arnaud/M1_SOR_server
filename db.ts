import { DatabaseSync } from "node:sqlite";

// db à la racine app_3tiers
export const db = new DatabaseSync("../polls.db");
