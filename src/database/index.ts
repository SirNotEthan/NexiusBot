import Database from './database';

let database: Database | null = null;

export const getDatabase = (): Database => {
    if (!database) {
        database = new Database();
    }
    return database;
};

export const initializeDatabase = async (): Promise<void> => {
    const db = getDatabase();
    await db.connect();
};

export const closeDatabase = async (): Promise<void> => {
    if (database) {
        await database.close();
        database = null;
    }
};

export { Database };
export type { TicketRecord } from './database';