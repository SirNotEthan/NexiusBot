import sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';

export interface TicketRecord {
    id: number;
    ticket_number: string;
    user_id: string;
    user_tag: string;
    channel_id: string;
    category?: string;
    subject?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    game?: string;
    gamemode?: string;
    goal?: string;
    contact: string;
    status: 'open' | 'claimed' | 'closed';
    claimed_by?: string;
    claimed_by_tag?: string;
    type: 'support' | 'regular' | 'paid';
    created_at: number;
    updated_at: number;
    closed_at?: number;
}

export interface HelperRecord {
    id: number;
    user_id: string;
    user_tag: string;
    helper_rank: string;
    total_vouches: number;
    last_vouch_date?: number;
    helper_since: number;
    weekly_vouches: number;
    monthly_vouches: number;
    average_rating: number;
    is_paid_helper: boolean;
    vouches_for_paid_access: number;
    created_at: number;
    updated_at: number;
}

export interface VouchRecord {
    id: number;
    ticket_id: number;
    helper_id: string;
    helper_tag: string;
    user_id: string;
    user_tag: string;
    rating: number;
    reason: string;
    type: 'regular' | 'paid';
    compensation?: string;
    created_at: number;
}

export interface PaidHelperRecord {
    id: number;
    user_id: string;
    user_tag: string;
    bio: string;
    bio_set_date: number;
    vouches_for_access: number;
    created_at: number;
    updated_at: number;
}

export interface UserMessageRecord {
    id: number;
    user_id: string;
    user_tag: string;
    date: string;
    message_count: number;
    free_carry_requests_used: number;
    created_at: number;
    updated_at: number;
}

export interface FreeCarryUsageRecord {
    id: number;
    user_id: string;
    user_tag: string;
    game: string;
    gamemode: string;
    date: string;
    usage_count: number;
    created_at: number;
    updated_at: number;
}

class DatabaseManager extends EventEmitter {
    private db: sqlite3.Database | null = null;
    private dbPath: string;
    private isConnected: boolean = false;
    
    private connectionPool: sqlite3.Database[] = [];
    private maxConnections = 5;
    private currentConnection = 0;
    
    private queryCache = new Map<string, {data: any, timestamp: number}>();
    private cacheTimeout = 60000; // 1 minute

    constructor() {
        super();
        const databasesDir = path.join(__dirname, '..', '..', 'databases');
        if (!fs.existsSync(databasesDir)) {
            fs.mkdirSync(databasesDir, { recursive: true });
        }
        this.dbPath = path.join(databasesDir, 'vouchbot.db');
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('✅ Connected to optimized SQLite database');
                    this.setupOptimizations();
                    this.initializeTables().then(() => {
                        this.isConnected = true;
                        this.emit('connected');
                        resolve();
                    }).catch(reject);
                }
            });
        });
    }

    private setupOptimizations(): void {
        if (!this.db) return;

        this.db.run('PRAGMA journal_mode = WAL');
        this.db.run('PRAGMA synchronous = NORMAL');
        this.db.run('PRAGMA cache_size = -64000'); // 64MB cache
        this.db.run('PRAGMA temp_store = MEMORY');
        this.db.run('PRAGMA mmap_size = 268435456'); // 256MB mmap

        console.log('✅ Database optimizations applied');
    }

    private async initializeTables(): Promise<void> {
        const tables = [
            `CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_number TEXT UNIQUE NOT NULL,
                user_id TEXT NOT NULL,
                user_tag TEXT NOT NULL,
                channel_id TEXT UNIQUE NOT NULL,
                category TEXT,
                subject TEXT,
                description TEXT,
                priority TEXT DEFAULT 'medium',
                game TEXT,
                gamemode TEXT,
                goal TEXT,
                contact TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                claimed_by TEXT,
                claimed_by_tag TEXT,
                type TEXT NOT NULL DEFAULT 'regular',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                closed_at INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS helpers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                user_tag TEXT NOT NULL,
                helper_rank TEXT NOT NULL DEFAULT 'Helper',
                total_vouches INTEGER NOT NULL DEFAULT 0,
                last_vouch_date INTEGER,
                helper_since INTEGER NOT NULL,
                weekly_vouches INTEGER NOT NULL DEFAULT 0,
                monthly_vouches INTEGER NOT NULL DEFAULT 0,
                average_rating REAL NOT NULL DEFAULT 0.0,
                is_paid_helper INTEGER NOT NULL DEFAULT 0,
                vouches_for_paid_access INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS vouches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER NOT NULL,
                helper_id TEXT NOT NULL,
                helper_tag TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_tag TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                reason TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'regular',
                compensation TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id),
                FOREIGN KEY (helper_id) REFERENCES helpers(user_id)
            )`,
            `CREATE TABLE IF NOT EXISTS paid_helpers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                user_tag TEXT NOT NULL,
                bio TEXT NOT NULL,
                bio_set_date INTEGER NOT NULL,
                vouches_for_access INTEGER NOT NULL DEFAULT 10,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES helpers(user_id)
            )`,
            `CREATE TABLE IF NOT EXISTS user_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                user_tag TEXT NOT NULL,
                date TEXT NOT NULL,
                message_count INTEGER NOT NULL DEFAULT 0,
                free_carry_requests_used INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, date)
            )`,
            `CREATE TABLE IF NOT EXISTS free_carry_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                user_tag TEXT NOT NULL,
                game TEXT NOT NULL,
                gamemode TEXT NOT NULL,
                date TEXT NOT NULL,
                usage_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, game, gamemode, date)
            )`,
            `CREATE TABLE IF NOT EXISTS ticket_counters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game TEXT UNIQUE NOT NULL,
                counter INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )`
        ];

        for (const sql of tables) {
            await this.runQuery(sql);
        }
        
        await this.createIndexes();
        console.log('✅ Tables and indexes initialized');

        await this.runMigrations();
    }

    private async createIndexes(): Promise<void> {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)',
            'CREATE INDEX IF NOT EXISTS idx_tickets_channel_id ON tickets(channel_id)',
            'CREATE INDEX IF NOT EXISTS idx_tickets_claimed_by ON tickets(claimed_by)',
            'CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(type)',
            'CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at)',
            
            'CREATE INDEX IF NOT EXISTS idx_helpers_user_id ON helpers(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_helpers_is_paid ON helpers(is_paid_helper)',
            'CREATE INDEX IF NOT EXISTS idx_helpers_total_vouches ON helpers(total_vouches)',
            'CREATE INDEX IF NOT EXISTS idx_helpers_weekly_vouches ON helpers(weekly_vouches)',
            'CREATE INDEX IF NOT EXISTS idx_helpers_monthly_vouches ON helpers(monthly_vouches)',
            
            'CREATE INDEX IF NOT EXISTS idx_vouches_helper_id ON vouches(helper_id)',
            'CREATE INDEX IF NOT EXISTS idx_vouches_user_id ON vouches(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_vouches_created_at ON vouches(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_vouches_type ON vouches(type)',
            
            'CREATE INDEX IF NOT EXISTS idx_user_messages_user_date ON user_messages(user_id, date)',
            
            'CREATE INDEX IF NOT EXISTS idx_free_carry_user_date ON free_carry_usage(user_id, date)'
        ];

        for (const sql of indexes) {
            await this.runQuery(sql);
        }
    }

    private async runMigrations(): Promise<void> {
        try {
            await this.runQuery('ALTER TABLE tickets ADD COLUMN category TEXT');
        } catch (e) { }
        
        try {
            await this.runQuery('ALTER TABLE tickets ADD COLUMN subject TEXT');
        } catch (e) { }
        
        try {
            await this.runQuery('ALTER TABLE tickets ADD COLUMN description TEXT');
        } catch (e) { }
        
        try {
            await this.runQuery('ALTER TABLE tickets ADD COLUMN priority TEXT DEFAULT "medium"');
        } catch (e) { }
        
        try {
            await this.runQuery('ALTER TABLE helpers ADD COLUMN vouches_for_paid_access INTEGER NOT NULL DEFAULT 0');
        } catch (e) { }
    }

    private runQuery(sql: string, params: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not connected'));
                return;
            }
            
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    private getQuery(sql: string, params: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not connected'));
                return;
            }
            
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    private getAllQuery(sql: string, params: any[] = []): Promise<any[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not connected'));
                return;
            }
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async createTicket(ticket: Omit<TicketRecord, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        const now = Date.now();
        const result = await this.runQuery(`
            INSERT INTO tickets (
                ticket_number, user_id, user_tag, channel_id, category, subject, description, priority, 
                game, gamemode, goal, contact, status, claimed_by, claimed_by_tag, type, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            ticket.ticket_number, ticket.user_id, ticket.user_tag, ticket.channel_id,
            ticket.category || null, ticket.subject || null, ticket.description || null, 
            ticket.priority || 'medium', ticket.game || null, ticket.gamemode || null,
            ticket.goal || null, ticket.contact, ticket.status, ticket.claimed_by || null,
            ticket.claimed_by_tag || null, ticket.type || 'regular', now, now
        ]);
        
        this.clearCache('tickets');
        this.clearCache(`user-${ticket.user_id}`);
        
        const ticketType = ticket.type === 'support' ? 'support ticket' : 'carry request';
        console.log(`✅ ${ticketType} ${ticket.ticket_number} created with ID ${result.lastID}`);
        return result.lastID;
    }

    async getTicket(ticketNumber: string): Promise<TicketRecord | null> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        return this.getCachedQuery(`ticket-${ticketNumber}`, async () => {
            return await this.getQuery('SELECT * FROM tickets WHERE ticket_number = ?', [ticketNumber]);
        });
    }

    async getTicketsByUser(userId: string): Promise<TicketRecord[]> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        return this.getCachedQuery(`user-tickets-${userId}`, async () => {
            return await this.getAllQuery('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        });
    }

    async getAllTickets(status?: 'open' | 'claimed' | 'closed'): Promise<TicketRecord[]> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        const cacheKey = status ? `tickets-status-${status}` : 'tickets-all';
        
        return this.getCachedQuery(cacheKey, async () => {
            if (status) {
                return await this.getAllQuery('SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC', [status]);
            } else {
                return await this.getAllQuery('SELECT * FROM tickets ORDER BY created_at DESC');
            }
        });
    }

    async getCachedQuery<T>(cacheKey: string, queryFn: () => Promise<T>): Promise<T> {
        const cached = this.queryCache.get(cacheKey);
        const now = Date.now();
        
        if (cached && (now - cached.timestamp) < this.cacheTimeout) {
            return cached.data as T;
        }
        
        const data = await queryFn();
        this.queryCache.set(cacheKey, { data, timestamp: now });
        return data;
    }

    clearCache(pattern?: string): void {
        if (pattern) {
            for (const key of this.queryCache.keys()) {
                if (key.includes(pattern)) {
                    this.queryCache.delete(key);
                }
            }
        } else {
            this.queryCache.clear();
        }
    }

    isHealthy(): boolean {
        if (!this.db || !this.isConnected) return false;
        
        try {
            this.db.get('SELECT 1', () => {});
            return true;
        } catch {
            return false;
        }
    }

    async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.isConnected = false;
                        this.queryCache.clear();
                        console.log('✅ Optimized database connection closed');
                        this.emit('disconnected');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    async updateTicket(ticketNumber: string, updates: Partial<TicketRecord>): Promise<void> {
        const updateFields: string[] = [];
        const values: any[] = [];

        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'id' && key !== 'ticket_number' && key !== 'created_at') {
                updateFields.push(`${key} = ?`);
                values.push(value);
            }
        });

        if (updateFields.length === 0) return;

        updateFields.push('updated_at = ?');
        values.push(Date.now());
        values.push(ticketNumber);

        await this.runQuery(`UPDATE tickets SET ${updateFields.join(', ')} WHERE ticket_number = ?`, values);
        this.clearCache('tickets');
        this.clearCache(`ticket-${ticketNumber}`);
    }

    async claimTicket(ticketNumber: string, claimedById: string, claimedByTag: string): Promise<void> {
        await this.updateTicket(ticketNumber, {
            status: 'claimed',
            claimed_by: claimedById,
            claimed_by_tag: claimedByTag
        });
    }

    async unclaimTicket(ticketNumber: string): Promise<void> {
        await this.updateTicket(ticketNumber, {
            status: 'open',
            claimed_by: null,
            claimed_by_tag: null
        });
    }

    async closeTicket(ticketNumber: string): Promise<void> {
        await this.updateTicket(ticketNumber, {
            status: 'closed',
            closed_at: Date.now()
        });
    }

    async getTicketByChannelId(channelId: string): Promise<TicketRecord | null> {
        return this.getCachedQuery(`ticket-channel-${channelId}`, async () => {
            return await this.getQuery('SELECT * FROM tickets WHERE channel_id = ?', [channelId]);
        });
    }

    async getHelper(userId: string): Promise<HelperRecord | null> {
        const row = await this.getQuery('SELECT * FROM helpers WHERE user_id = ?', [userId]);
        if (row) {
            row.is_paid_helper = row.is_paid_helper === 1;
            if (row.vouches_for_paid_access === undefined) {
                row.vouches_for_paid_access = 0;
            }
            return row as HelperRecord;
        }
        return null;
    }

    async createHelper(helper: Omit<HelperRecord, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        const now = Date.now();
        const result = await this.runQuery(`
            INSERT INTO helpers (
                user_id, user_tag, helper_rank, total_vouches, last_vouch_date, helper_since, 
                weekly_vouches, monthly_vouches, average_rating, is_paid_helper, vouches_for_paid_access, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            helper.user_id, helper.user_tag, helper.helper_rank, helper.total_vouches,
            helper.last_vouch_date, helper.helper_since, helper.weekly_vouches,
            helper.monthly_vouches, helper.average_rating, helper.is_paid_helper ? 1 : 0,
            helper.vouches_for_paid_access, now, now
        ]);
        
        console.log(`✅ Helper ${helper.user_tag} created with ID ${result.lastID}`);
        return result.lastID;
    }

    async updateHelper(userId: string, updates: Partial<HelperRecord>): Promise<void> {
        const updateFields: string[] = [];
        const values: any[] = [];

        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'id' && key !== 'user_id' && key !== 'created_at') {
                updateFields.push(`${key} = ?`);
                if (key === 'is_paid_helper') {
                    values.push(value ? 1 : 0);
                } else {
                    values.push(value);
                }
            }
        });

        if (updateFields.length === 0) return;

        updateFields.push('updated_at = ?');
        values.push(Date.now());
        values.push(userId);

        await this.runQuery(`UPDATE helpers SET ${updateFields.join(', ')} WHERE user_id = ?`, values);
        this.clearCache('helpers');
        this.clearCache(`helper-${userId}`);
    }

    async createVouch(vouch: Omit<VouchRecord, 'id' | 'created_at'>): Promise<number> {
        const now = Date.now();
        const result = await this.runQuery(`
            INSERT INTO vouches (
                ticket_id, helper_id, helper_tag, user_id, user_tag, rating, reason, type, compensation, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            vouch.ticket_id, vouch.helper_id, vouch.helper_tag, vouch.user_id,
            vouch.user_tag, vouch.rating, vouch.reason, vouch.type,
            vouch.compensation, now
        ]);
        
        this.clearCache('vouches');
        this.clearCache(`helper-${vouch.helper_id}`);
        
        console.log(`✅ Vouch created with ID ${result.lastID}`);
        return result.lastID;
    }

    async getHelperVouches(helperId: string, limit?: number): Promise<VouchRecord[]> {
        let query = 'SELECT * FROM vouches WHERE helper_id = ? ORDER BY created_at DESC';
        const params: any[] = [helperId];
        
        if (limit) {
            query += ' LIMIT ?';
            params.push(limit);
        }

        return this.getCachedQuery(`helper-vouches-${helperId}-${limit || 'all'}`, async () => {
            return await this.getAllQuery(query, params);
        });
    }

    async getNextTicketNumber(game: string): Promise<string> {
        const now = Date.now();
        
        try {
            const getQuery = 'SELECT counter FROM ticket_counters WHERE game = ?';
            let counter = await this.getQuery(getQuery, [game]) as { counter: number } | undefined;
            
            if (!counter) {
                const insertQuery = 'INSERT INTO ticket_counters (game, counter, created_at, updated_at) VALUES (?, ?, ?, ?)';
                await this.runQuery(insertQuery, [game, 1, now, now]);
                return '1';
            }
            
            const updateQuery = 'UPDATE ticket_counters SET counter = counter + 1, updated_at = ? WHERE game = ?';
            await this.runQuery(updateQuery, [now, game]);
            
            return (counter.counter + 1).toString();
        } catch (error) {
            console.error('Error getting next ticket number:', error);
            throw error;
        }
    }

    async resetTicketCounter(game: string): Promise<void> {
        const now = Date.now();
        
        try {
            const query = 'UPDATE ticket_counters SET counter = 0, updated_at = ? WHERE game = ?';
            await this.runQuery(query, [now, game]);
        } catch (error) {
            console.error('Error resetting ticket counter:', error);
            throw error;
        }
    }
}

let databaseInstance: DatabaseManager | null = null;

export const getDatabase = async (): Promise<DatabaseManager> => {
    if (!databaseInstance) {
        databaseInstance = new DatabaseManager();
        await databaseInstance.connect();
        
        setInterval(() => {
            if (!databaseInstance?.isHealthy()) {
                console.warn('⚠️ Database connection unhealthy, attempting reconnection...');
                databaseInstance?.connect().catch(console.error);
            }
        }, 30000); // Check every 30 seconds
    }
    return databaseInstance;
};

export const closeDatabaseConnection = async (): Promise<void> => {
    if (databaseInstance) {
        await databaseInstance.close();
        databaseInstance = null;
    }
};

export default DatabaseManager;