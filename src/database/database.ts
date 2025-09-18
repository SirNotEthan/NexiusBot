import Database from 'better-sqlite3';
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

export interface MiddlemanRequestRecord {
    id: number;
    ticket_number: string;
    user_id: string;
    user_tag: string;
    channel_id: string;
    game: string;
    trade_details: string;
    trade_value: string;
    other_party?: string;
    contact_method: string;
    status: 'pending' | 'approved' | 'declined' | 'in_progress' | 'completed' | 'disputed';
    middleman_id?: string;
    middleman_tag?: string;
    decline_reason?: string;
    created_at: number;
    updated_at: number;
    completed_at?: number;
}

export interface MiddlemanTransactionRecord {
    id: number;
    request_id: number;
    party1_id: string;
    party1_tag: string;
    party2_id: string;
    party2_tag: string;
    middleman_id: string;
    middleman_tag: string;
    transaction_details: string;
    status: 'active' | 'completed' | 'disputed';
    completion_notes?: string;
    created_at: number;
    updated_at: number;
    completed_at?: number;
}

export interface MiddlemanDisputeRecord {
    id: number;
    transaction_id: string;
    reporter_id: string;
    reporter_tag: string;
    dispute_reason: string;
    evidence_description?: string;
    status: 'open' | 'investigating' | 'resolved' | 'closed';
    resolution?: string;
    resolved_by?: string;
    resolved_by_tag?: string;
    created_at: number;
    updated_at: number;
    resolved_at?: number;
}

class DatabaseManager extends EventEmitter {
    private db: Database.Database | null = null;
    private dbPath: string;
    private preparedStatements: Map<string, any> = new Map();
    private isConnected: boolean = false;

    constructor() {
        super();
        const databasesDir = path.join(__dirname, '..', '..', 'databases');
        if (!fs.existsSync(databasesDir)) {
            fs.mkdirSync(databasesDir, { recursive: true });
        }
        this.dbPath = path.join(databasesDir, 'vouchbot.db');
    }

    async connect(): Promise<void> {
        try {
            this.db = new Database(this.dbPath, {
                verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
                fileMustExist: false
            });
            
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = 1000');
            this.db.pragma('temp_store = MEMORY');
            this.db.pragma('mmap_size = 268435456');
            
            console.log('✅ Connected to SQLite database with optimizations');
            await this.initializeTables();
            this.prepareStatements();
            this.isConnected = true;
            this.emit('connected');
        } catch (error) {
            console.error('Error opening database:', error);
            throw error;
        }
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
            )`,
            `CREATE TABLE IF NOT EXISTS middleman_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_number TEXT UNIQUE NOT NULL,
                user_id TEXT NOT NULL,
                user_tag TEXT NOT NULL,
                channel_id TEXT UNIQUE NOT NULL,
                game TEXT NOT NULL,
                trade_details TEXT NOT NULL,
                trade_value TEXT NOT NULL,
                other_party TEXT,
                contact_method TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                middleman_id TEXT,
                middleman_tag TEXT,
                decline_reason TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                completed_at INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS middleman_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id INTEGER NOT NULL,
                party1_id TEXT NOT NULL,
                party1_tag TEXT NOT NULL,
                party2_id TEXT NOT NULL,
                party2_tag TEXT NOT NULL,
                middleman_id TEXT NOT NULL,
                middleman_tag TEXT NOT NULL,
                transaction_details TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                completion_notes TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                completed_at INTEGER,
                FOREIGN KEY (request_id) REFERENCES middleman_requests(id)
            )`,
            `CREATE TABLE IF NOT EXISTS middleman_disputes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT NOT NULL,
                reporter_id TEXT NOT NULL,
                reporter_tag TEXT NOT NULL,
                dispute_reason TEXT NOT NULL,
                evidence_description TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                resolution TEXT,
                resolved_by TEXT,
                resolved_by_tag TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                resolved_at INTEGER
            )`
        ];

        const tableNames = ['tickets', 'helpers', 'vouches', 'paid_helpers', 'user_messages', 'free_carry_usage', 'ticket_counters', 'middleman_requests', 'middleman_transactions', 'middleman_disputes'];
        
        try {
            this.db!.transaction(() => {
                tables.forEach((sql, i) => {
                    this.db!.exec(sql);
                    console.log(`✅ ${tableNames[i]} table initialized`);
                });
            })();
        } catch (error) {
            console.error('Error creating tables:', error);
            throw error;
        }

        this.createIndexes();
        await this.migrateToServerSupportTickets();
        await this.migratePaidHelperVouches();
    }

    private createIndexes(): void {
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
            'CREATE INDEX IF NOT EXISTS idx_helpers_paid_access ON helpers(vouches_for_paid_access)',
            'CREATE INDEX IF NOT EXISTS idx_vouches_helper_id ON vouches(helper_id)',
            'CREATE INDEX IF NOT EXISTS idx_vouches_user_id ON vouches(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_vouches_ticket_id ON vouches(ticket_id)',
            'CREATE INDEX IF NOT EXISTS idx_vouches_created_at ON vouches(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_vouches_type ON vouches(type)',
            'CREATE INDEX IF NOT EXISTS idx_user_messages_user_date ON user_messages(user_id, date)',
            'CREATE INDEX IF NOT EXISTS idx_free_carry_user_date ON free_carry_usage(user_id, date)',
            'CREATE INDEX IF NOT EXISTS idx_free_carry_game ON free_carry_usage(game, gamemode)'
        ];

        try {
            this.db!.transaction(() => {
                indexes.forEach(sql => {
                    this.db!.exec(sql);
                });
            })();
            console.log('✅ Database indexes created');
        } catch (error) {
            console.error('Error creating indexes:', error);
        }
    }

    private prepareStatements(): void {
        const statements = {
            createTicket: `INSERT INTO tickets (
                ticket_number, user_id, user_tag, channel_id, category, subject, description, priority, 
                game, gamemode, goal, contact, status, claimed_by, claimed_by_tag, type, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            
            getTicketByNumber: 'SELECT * FROM tickets WHERE ticket_number = ?',
            getTicketByChannel: 'SELECT * FROM tickets WHERE channel_id = ?',
            getTicketsByUser: 'SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC',
            getTicketsByStatus: 'SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC',
            getAllTickets: 'SELECT * FROM tickets ORDER BY created_at DESC',
            updateTicketStatus: 'UPDATE tickets SET status = ?, updated_at = ? WHERE ticket_number = ?',
            
            createHelper: `INSERT INTO helpers (
                user_id, user_tag, helper_rank, total_vouches, last_vouch_date, helper_since, 
                weekly_vouches, monthly_vouches, average_rating, is_paid_helper, vouches_for_paid_access, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            
            getHelper: 'SELECT * FROM helpers WHERE user_id = ?',
            updateHelperStats: 'UPDATE helpers SET total_vouches = ?, weekly_vouches = ?, monthly_vouches = ?, average_rating = ?, updated_at = ? WHERE user_id = ?',
            
            createVouch: `INSERT INTO vouches (
                ticket_id, helper_id, helper_tag, user_id, user_tag, rating, reason, type, compensation, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            
            getHelperVouches: 'SELECT * FROM vouches WHERE helper_id = ? ORDER BY created_at DESC',
            getHelperVouchesTimeframe: 'SELECT * FROM vouches WHERE helper_id = ? AND created_at >= ? ORDER BY created_at DESC',
            
            incrementUserMessages: `INSERT INTO user_messages (user_id, user_tag, date, message_count, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?)
                ON CONFLICT(user_id, date) DO UPDATE SET 
                    message_count = message_count + 1,
                    user_tag = excluded.user_tag,
                    updated_at = excluded.updated_at`,
            
            getUserMessageStats: 'SELECT * FROM user_messages WHERE user_id = ? AND date = ?'
        };

        for (const [name, sql] of Object.entries(statements)) {
            this.preparedStatements.set(name, this.db!.prepare(sql));
        }
        
        console.log('✅ Prepared statements ready');
    }

    private async migrateToServerSupportTickets(): Promise<void> {
        try {
            const columns = this.db!.pragma('table_info(tickets)') as Array<{name: string}>;
            const columnNames = columns.map((col: any) => col.name);
            const needsMigration = !columnNames.includes('category') || 
                                 !columnNames.includes('subject') || 
                                 !columnNames.includes('description') || 
                                 !columnNames.includes('priority');

            if (needsMigration) {
                console.log('🔄 Adding server support columns to tickets table...');
                this.db!.transaction(() => {
                    this.db!.exec('ALTER TABLE tickets ADD COLUMN category TEXT');
                    this.db!.exec('ALTER TABLE tickets ADD COLUMN subject TEXT');
                    this.db!.exec('ALTER TABLE tickets ADD COLUMN description TEXT');
                    this.db!.exec('ALTER TABLE tickets ADD COLUMN priority TEXT DEFAULT "medium"');
                })();
                console.log('✅ Migration: Added server support columns to tickets table');
            }
        } catch (error) {
            console.error('Migration failed:', error);
        }
    }

    private async migratePaidHelperVouches(): Promise<void> {
        try {
            const columns = this.db!.pragma('table_info(helpers)') as Array<{name: string}>;
            const columnNames = columns.map((col: any) => col.name);
            const needsMigration = !columnNames.includes('vouches_for_paid_access');

            if (needsMigration) {
                console.log('🔄 Adding vouches_for_paid_access column to helpers table...');
                this.db!.exec('ALTER TABLE helpers ADD COLUMN vouches_for_paid_access INTEGER NOT NULL DEFAULT 0');
                console.log('✅ Migration: Added vouches_for_paid_access column to helpers table');
            }
        } catch (error) {
            console.error('Paid helper vouches migration failed:', error);
        }
    }

    async createTicket(ticket: Omit<TicketRecord, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        const now = Date.now();
        const stmt = this.preparedStatements.get('createTicket');
        
        try {
            const result = stmt.run([
                ticket.ticket_number,
                ticket.user_id,
                ticket.user_tag,
                ticket.channel_id,
                ticket.category || null,
                ticket.subject || null,
                ticket.description || null,
                ticket.priority || 'medium',
                ticket.game || null,
                ticket.gamemode || null,
                ticket.goal || null,
                ticket.contact,
                ticket.status,
                ticket.claimed_by || null,
                ticket.claimed_by_tag || null,
                ticket.type || 'regular',
                now,
                now
            ]);
            
            const ticketType = ticket.type === 'support' ? 'support ticket' : 'carry request';
            console.log(`✅ ${ticketType} ${ticket.ticket_number} created with ID ${result.lastInsertRowid}`);
            return result.lastInsertRowid as number;
        } catch (error) {
            console.error('Error creating ticket:', error);
            throw error;
        }
    }

    async getTicket(ticketNumber: string): Promise<TicketRecord | null> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        const stmt = this.preparedStatements.get('getTicketByNumber');
        try {
            const row = stmt.get(ticketNumber) as TicketRecord | undefined;
            return row || null;
        } catch (error) {
            console.error('Error getting ticket:', error);
            throw error;
        }
    }

    async getTicketByChannelId(channelId: string): Promise<TicketRecord | null> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        const stmt = this.preparedStatements.get('getTicketByChannel');
        try {
            const row = stmt.get(channelId) as TicketRecord | undefined;
            return row || null;
        } catch (error) {
            console.error('Error getting ticket by channel:', error);
            throw error;
        }
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

        if (updateFields.length === 0) {
            return;
        }

        updateFields.push('updated_at = ?');
        values.push(Date.now());
        values.push(ticketNumber);

        const query = `UPDATE tickets SET ${updateFields.join(', ')} WHERE ticket_number = ?`;

        try {
            this.db!.prepare(query).run(values);
            console.log(`✅ Ticket ${ticketNumber} updated`);
        } catch (error) {
            console.error('Error updating ticket:', error);
            throw error;
        }
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

    async getAllTickets(status?: 'open' | 'claimed' | 'closed'): Promise<TicketRecord[]> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        try {
            if (status) {
                const stmt = this.preparedStatements.get('getTicketsByStatus');
                return stmt.all(status) as TicketRecord[];
            } else {
                const stmt = this.preparedStatements.get('getAllTickets');
                return stmt.all() as TicketRecord[];
            }
        } catch (error) {
            console.error('Error getting tickets:', error);
            throw error;
        }
    }

    async getTicketsByUser(userId: string): Promise<TicketRecord[]> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        const stmt = this.preparedStatements.get('getTicketsByUser');
        try {
            return stmt.all(userId) as TicketRecord[];
        } catch (error) {
            console.error('Error getting user tickets:', error);
            throw error;
        }
    }

    async createHelper(helper: Omit<HelperRecord, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        const now = Date.now();
        const stmt = this.preparedStatements.get('createHelper');
        
        try {
            const result = stmt.run([
                helper.user_id,
                helper.user_tag,
                helper.helper_rank,
                helper.total_vouches,
                helper.last_vouch_date,
                helper.helper_since,
                helper.weekly_vouches,
                helper.monthly_vouches,
                helper.average_rating,
                helper.is_paid_helper ? 1 : 0,
                helper.vouches_for_paid_access,
                now,
                now
            ]);
            
            console.log(`✅ Helper ${helper.user_tag} created with ID ${result.lastInsertRowid}`);
            return result.lastInsertRowid as number;
        } catch (error) {
            console.error('Error creating helper:', error);
            throw error;
        }
    }

    async getHelper(userId: string): Promise<HelperRecord | null> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        const stmt = this.preparedStatements.get('getHelper');
        try {
            const row = stmt.get(userId) as any;
            if (row) {
                row.is_paid_helper = row.is_paid_helper === 1;
                if (row.vouches_for_paid_access === undefined) {
                    row.vouches_for_paid_access = 0;
                }
                return row as HelperRecord;
            }
            return null;
        } catch (error) {
            console.error('Error getting helper:', error);
            throw error;
        }
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

        if (updateFields.length === 0) {
            return;
        }

        updateFields.push('updated_at = ?');
        values.push(Date.now());
        values.push(userId);

        const query = `UPDATE helpers SET ${updateFields.join(', ')} WHERE user_id = ?`;

        try {
            this.db!.prepare(query).run(values);
            console.log(`✅ Helper ${userId} updated`);
        } catch (error) {
            console.error('Error updating helper:', error);
            throw error;
        }
    }

    async createVouch(vouch: Omit<VouchRecord, 'id' | 'created_at'>): Promise<number> {
        const now = Date.now();
        const query = `
            INSERT INTO vouches (
                ticket_id, helper_id, helper_tag, user_id, user_tag, rating, reason, type, compensation, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        try {
            const result = this.db!.prepare(query).run([
                vouch.ticket_id,
                vouch.helper_id,
                vouch.helper_tag,
                vouch.user_id,
                vouch.user_tag,
                vouch.rating,
                vouch.reason,
                vouch.type,
                vouch.compensation,
                now
            ]);
            console.log(`✅ Vouch created with ID ${result.lastInsertRowid}`);
            return result.lastInsertRowid as number;
        } catch (error) {
            console.error('Error creating vouch:', error);
            throw error;
        }
    }

    async getHelperVouches(helperId: string, limit?: number): Promise<VouchRecord[]> {
        let query = 'SELECT * FROM vouches WHERE helper_id = ? ORDER BY created_at DESC';
        const params: any[] = [helperId];
        
        if (limit) {
            query += ' LIMIT ?';
            params.push(limit);
        }

        try {
            return this.db!.prepare(query).all(params) as VouchRecord[];
        } catch (error) {
            console.error('Error getting helper vouches:', error);
            throw error;
        }
    }

    async getHelperVouchesByTimeframe(helperId: string, timeframe: 'weekly' | 'monthly'): Promise<VouchRecord[]> {
        const now = Date.now();
        const timeAgo = timeframe === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
        const since = now - timeAgo;

        const query = 'SELECT * FROM vouches WHERE helper_id = ? AND created_at >= ? ORDER BY created_at DESC';

        try {
            return this.db!.prepare(query).all([helperId, since]) as VouchRecord[];
        } catch (error) {
            console.error('Error getting helper vouches by timeframe:', error);
            throw error;
        }
    }

    async getTopHelpers(type: 'regular' | 'paid', timeframe: 'weekly' | 'monthly' | 'overall', limit: number = 10): Promise<any[]> {
        let query = '';
        let params: any[] = [];

        if (timeframe === 'overall') {
            query = `
                SELECT h.user_id, h.user_tag, h.total_vouches, h.average_rating,
                       COUNT(v.id) as vouch_count
                FROM helpers h
                LEFT JOIN vouches v ON h.user_id = v.helper_id AND v.type = ?
                WHERE h.is_paid_helper = ?
                GROUP BY h.user_id, h.user_tag, h.total_vouches, h.average_rating
                ORDER BY h.total_vouches DESC
                LIMIT ?
            `;
            params = [type, type === 'paid' ? 1 : 0, limit];
        } else {
            const now = Date.now();
            const timeAgo = timeframe === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
            const since = now - timeAgo;

            query = `
                SELECT h.user_id, h.user_tag, COUNT(v.id) as vouch_count, 
                       AVG(v.rating) as avg_rating
                FROM helpers h
                LEFT JOIN vouches v ON h.user_id = v.helper_id AND v.type = ? AND v.created_at >= ?
                WHERE h.is_paid_helper = ?
                GROUP BY h.user_id, h.user_tag
                ORDER BY vouch_count DESC
                LIMIT ?
            `;
            params = [type, since, type === 'paid' ? 1 : 0, limit];
        }

        try {
            return this.db!.prepare(query).all(params) as any[];
        } catch (error) {
            console.error('Error getting top helpers:', error);
            throw error;
        }
    }

    async createPaidHelper(paidHelper: Omit<PaidHelperRecord, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        const now = Date.now();
        const query = `
            INSERT INTO paid_helpers (
                user_id, user_tag, bio, bio_set_date, vouches_for_access, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        try {
            const result = this.db!.prepare(query).run([
                paidHelper.user_id,
                paidHelper.user_tag,
                paidHelper.bio,
                paidHelper.bio_set_date,
                paidHelper.vouches_for_access,
                now,
                now
            ]);
            console.log(`✅ Paid helper ${paidHelper.user_tag} created with ID ${result.lastInsertRowid}`);
            return result.lastInsertRowid as number;
        } catch (error) {
            console.error('Error creating paid helper:', error);
            throw error;
        }
    }

    async getPaidHelper(userId: string): Promise<PaidHelperRecord | null> {
        const query = 'SELECT * FROM paid_helpers WHERE user_id = ?';
        
        try {
            const row = this.db!.prepare(query).get([userId]) as PaidHelperRecord | undefined;
            return row || null;
        } catch (error) {
            console.error('Error getting paid helper:', error);
            throw error;
        }
    }

    async updatePaidHelper(userId: string, updates: Partial<PaidHelperRecord>): Promise<void> {
        const updateFields: string[] = [];
        const values: any[] = [];

        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'id' && key !== 'user_id' && key !== 'created_at') {
                updateFields.push(`${key} = ?`);
                values.push(value);
            }
        });

        if (updateFields.length === 0) {
            return;
        }

        updateFields.push('updated_at = ?');
        values.push(Date.now());
        values.push(userId);

        const query = `UPDATE paid_helpers SET ${updateFields.join(', ')} WHERE user_id = ?`;

        try {
            this.db!.prepare(query).run(values);
            console.log(`✅ Paid helper ${userId} updated`);
        } catch (error) {
            console.error('Error updating paid helper:', error);
            throw error;
        }
    }

    async getAllPaidHelpers(): Promise<PaidHelperRecord[]> {
        const query = 'SELECT * FROM paid_helpers ORDER BY created_at DESC';

        try {
            return this.db!.prepare(query).all([]) as PaidHelperRecord[];
        } catch (error) {
            console.error('Error getting all paid helpers:', error);
            throw error;
        }
    }

    async getActivePaidHelpers(): Promise<PaidHelperRecord[]> {
        const query = `
            SELECT * FROM paid_helpers 
            WHERE bio NOT LIKE '%[REMOVED BY STAFF]%' 
            ORDER BY bio_set_date DESC
        `;

        try {
            return this.db!.prepare(query).all([]) as PaidHelperRecord[];
        } catch (error) {
            console.error('Error getting active paid helpers:', error);
            throw error;
        }
    }

    async resetWeeklyStats(): Promise<void> {
        const query = 'UPDATE helpers SET weekly_vouches = 0, vouches_for_paid_access = 0';

        try {
            this.db!.prepare(query).run([]);
            console.log('✅ Weekly stats reset (including paid helper vouches)');
        } catch (error) {
            console.error('Error resetting weekly stats:', error);
            throw error;
        }
    }

    async resetMonthlyStats(): Promise<void> {
        const query = 'UPDATE helpers SET monthly_vouches = 0';

        try {
            this.db!.prepare(query).run([]);
            console.log('✅ Monthly stats reset');
        } catch (error) {
            console.error('Error resetting monthly stats:', error);
            throw error;
        }
    }

    async getHelpersForDemotion(): Promise<HelperRecord[]> {
        const query = 'SELECT * FROM helpers WHERE weekly_vouches < 10';

        try {
            const rows = this.db!.prepare(query).all([]) as any[];
            const helpers = rows.map(row => ({
                ...row,
                is_paid_helper: row.is_paid_helper === 1
            }));
            return helpers;
        } catch (error) {
            console.error('Error getting helpers for demotion:', error);
            throw error;
        }
    }

    async incrementUserMessages(userId: string, userTag: string): Promise<void> {
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();

        const query = `
            INSERT INTO user_messages (user_id, user_tag, date, message_count, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)
            ON CONFLICT(user_id, date) 
            DO UPDATE SET 
                message_count = message_count + 1,
                user_tag = ?,
                updated_at = ?
        `;

        try {
            this.db!.prepare(query).run([userId, userTag, today, now, now, userTag, now]);
        } catch (error) {
            console.error('Error incrementing user messages:', error);
            throw error;
        }
    }

    async getUserMessageStats(userId: string): Promise<UserMessageRecord | null> {
        const today = new Date().toISOString().split('T')[0];
        const query = 'SELECT * FROM user_messages WHERE user_id = ? AND date = ?';

        try {
            const row = this.db!.prepare(query).get([userId, today]) as UserMessageRecord | undefined;
            return row || null;
        } catch (error) {
            console.error('Error getting user message stats:', error);
            throw error;
        }
    }

    async incrementFreeCarryRequests(userId: string): Promise<void> {
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();

        const query = `
            UPDATE user_messages 
            SET free_carry_requests_used = free_carry_requests_used + 1, updated_at = ?
            WHERE user_id = ? AND date = ?
        `;

        try {
            this.db!.prepare(query).run([now, userId, today]);
        } catch (error) {
            console.error('Error incrementing free carry requests:', error);
            throw error;
        }
    }

    async getFreeCarryUsage(userId: string, game: string, gamemode: string): Promise<FreeCarryUsageRecord | null> {
        const today = new Date().toISOString().split('T')[0];
        const query = 'SELECT * FROM free_carry_usage WHERE user_id = ? AND game = ? AND gamemode = ? AND date = ?';

        try {
            const row = this.db!.prepare(query).get([userId, game, gamemode, today]) as FreeCarryUsageRecord | undefined;
            return row || null;
        } catch (error) {
            console.error('Error getting free carry usage:', error);
            throw error;
        }
    }

    async incrementFreeCarryUsage(userId: string, userTag: string, game: string, gamemode: string): Promise<void> {
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();

        const query = `
            INSERT INTO free_carry_usage (user_id, user_tag, game, gamemode, date, usage_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(user_id, game, gamemode, date) 
            DO UPDATE SET 
                usage_count = usage_count + 1,
                user_tag = ?,
                updated_at = ?
        `;

        try {
            this.db!.prepare(query).run([userId, userTag, game, gamemode, today, now, now, userTag, now]);
            console.log(`[DB] Incremented free carry usage for user ${userId}, game ${game}, gamemode ${gamemode}`);
        } catch (error) {
            console.error('Error incrementing free carry usage:', error);
            throw error;
        }
    }

    async tryIncrementFreeCarryUsage(userId: string, userTag: string, game: string, gamemode: string, limit: number): Promise<{success: boolean, currentUsage: number}> {
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();

        try {
            // Pure atomic operation - no separate checks
            const query = `
                INSERT INTO free_carry_usage (user_id, user_tag, game, gamemode, date, usage_count, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(user_id, game, gamemode, date) 
                DO UPDATE SET 
                    usage_count = CASE 
                        WHEN usage_count < ? THEN usage_count + 1 
                        ELSE usage_count 
                    END,
                    user_tag = ?,
                    updated_at = ?
                RETURNING usage_count
            `;

            const result = this.db!.prepare(query).get([userId, userTag, game, gamemode, today, now, now, limit, userTag, now]) as {usage_count: number} | undefined;
            
            if (!result) {
                console.error(`[DB] Failed to get result from atomic increment for user ${userId}, game ${game}, gamemode ${gamemode}`);
                return {success: false, currentUsage: 0};
            }

            const newUsage = result.usage_count;
            const success = newUsage <= limit;
            
            console.log(`[DB] Atomic increment for user ${userId}, game ${game}, gamemode ${gamemode}: ${newUsage}/${limit}, success: ${success}`);
            
            return {success, currentUsage: newUsage};
        } catch (error) {
            console.error('Error in atomic free carry usage increment:', error);
            throw error;
        }
    }

    async checkAndReserveFreeCarrySlot(userId: string, userTag: string, game: string, gamemode: string): Promise<{eligible: boolean, reason?: string, limit?: number, used?: number}> {
        if (!this.isConnected) throw new Error('Database not connected');

        try {
            console.log(`[FREE_CARRY_RESERVE] Checking and reserving slot for user ${userId}, game ${game}, gamemode ${gamemode}`);
            
            const messageStats = await this.getUserMessageStats(userId);
            
            if (!messageStats) {
                console.log(`[FREE_CARRY_RESERVE] No message stats found for user ${userId}`);
                return { eligible: false, reason: 'No message activity found today' };
            }
            
            const hasEnoughMessages = messageStats.message_count >= 50;
            if (!hasEnoughMessages) {
                console.log(`[FREE_CARRY_RESERVE] User ${userId} has insufficient messages: ${messageStats.message_count}/50`);
                return { eligible: false, reason: `Need at least 50 messages today (currently ${messageStats.message_count})` };
            }
            
            const { getFreeCarryLimit } = require('../config/freeCarriesConfig');
            const gamemodeLimit = getFreeCarryLimit(game, gamemode);
            if (gamemodeLimit === 0) {
                console.log(`[FREE_CARRY_RESERVE] Gamemode ${gamemode} for game ${game} does not support free carries`);
                return { eligible: false, reason: 'This gamemode does not support free carries' };
            }
            
            // Atomically try to reserve a slot
            const reserveResult = await this.tryIncrementFreeCarryUsage(userId, userTag, game, gamemode, gamemodeLimit);
            
            if (!reserveResult.success) {
                console.log(`[FREE_CARRY_RESERVE] Failed to reserve slot for user ${userId}: ${reserveResult.currentUsage}/${gamemodeLimit}`);
                return { 
                    eligible: false, 
                    reason: `Daily limit reached for this gamemode (${reserveResult.currentUsage}/${gamemodeLimit})`,
                    limit: gamemodeLimit,
                    used: reserveResult.currentUsage
                };
            }
            
            console.log(`[FREE_CARRY_RESERVE] Successfully reserved slot for user ${userId}: ${reserveResult.currentUsage}/${gamemodeLimit}`);
            return { 
                eligible: true,
                limit: gamemodeLimit,
                used: reserveResult.currentUsage
            };
        } catch (error) {
            console.error('Error in checkAndReserveFreeCarrySlot:', error);
            throw error;
        }
    }

    async releaseReservedFreeCarrySlot(userId: string, game: string, gamemode: string): Promise<void> {
        if (!this.isConnected) throw new Error('Database not connected');

        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();

        try {
            console.log(`[FREE_CARRY_RELEASE] Releasing reserved slot for user ${userId}, game ${game}, gamemode ${gamemode}`);
            
            const query = `
                UPDATE free_carry_usage 
                SET usage_count = CASE 
                    WHEN usage_count > 0 THEN usage_count - 1 
                    ELSE 0 
                END,
                updated_at = ?
                WHERE user_id = ? AND game = ? AND gamemode = ? AND date = ?
            `;

            const stmt = this.db!.prepare(query);
            const result = stmt.run([now, userId, game, gamemode, today]);
            
            console.log(`[FREE_CARRY_RELEASE] Released slot for user ${userId}, changes: ${result.changes}`);
        } catch (error) {
            console.error('Error releasing reserved free carry slot:', error);
            throw error;
        }
    }

    async getUserFreeCarryUsageByDate(userId: string, date?: string): Promise<FreeCarryUsageRecord[]> {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const query = 'SELECT * FROM free_carry_usage WHERE user_id = ? AND date = ? ORDER BY game, gamemode';

        try {
            return this.db!.prepare(query).all([userId, targetDate]) as FreeCarryUsageRecord[];
        } catch (error) {
            console.error('Error getting user free carry usage by date:', error);
            throw error;
        }
    }

    async checkPaidHelperEligibility(userId: string): Promise<{eligible: boolean, vouchesNeeded: number, currentVouches: number}> {
        const helper = await this.getHelper(userId);
        
        if (!helper) {
            return { eligible: false, vouchesNeeded: 10, currentVouches: 0 };
        }
        
        const currentVouches = helper.vouches_for_paid_access;
        const vouchesNeeded = Math.max(0, 10 - currentVouches);
        
        return {
            eligible: currentVouches >= 10,
            vouchesNeeded,
            currentVouches
        };
    }

    async incrementPaidHelperVouches(helperId: string): Promise<void> {
        const query = `
            UPDATE helpers 
            SET vouches_for_paid_access = vouches_for_paid_access + 1, updated_at = ?
            WHERE user_id = ? AND vouches_for_paid_access < 10
        `;

        try {
            this.db!.prepare(query).run([Date.now(), helperId]);
        } catch (error) {
            console.error('Error incrementing paid helper vouches:', error);
            throw error;
        }
    }

    async getEligibleForPaidHelperStatus(): Promise<HelperRecord[]> {
        const query = 'SELECT * FROM helpers WHERE vouches_for_paid_access >= 10 AND is_paid_helper = 0';

        try {
            const rows = this.db!.prepare(query).all([]) as any[];
            const helpers = rows.map(row => ({
                ...row,
                is_paid_helper: row.is_paid_helper === 1,
                vouches_for_paid_access: row.vouches_for_paid_access || 0
            }));
            return helpers;
        } catch (error) {
            console.error('Error getting eligible paid helpers:', error);
            throw error;
        }
    }

    async bulkUpdateHelperStats(updates: Array<{userId: string, stats: Partial<HelperRecord>}>): Promise<void> {
        if (!this.isConnected) throw new Error('Database not connected');
        
        const transaction = this.db!.transaction((updates: Array<{userId: string, stats: Partial<HelperRecord>}>) => {
            const stmt = this.db!.prepare(`
                UPDATE helpers 
                SET total_vouches = ?, weekly_vouches = ?, monthly_vouches = ?, average_rating = ?, updated_at = ? 
                WHERE user_id = ?
            `);
            
            for (const { userId, stats } of updates) {
                stmt.run([
                    stats.total_vouches || 0,
                    stats.weekly_vouches || 0, 
                    stats.monthly_vouches || 0,
                    stats.average_rating || 0.0,
                    Date.now(),
                    userId
                ]);
            }
        });
        
        try {
            transaction(updates);
            console.log(`✅ Bulk updated ${updates.length} helper stats`);
        } catch (error) {
            console.error('Error in bulk update:', error);
            throw error;
        }
    }

    private queryCache = new Map<string, {data: any, timestamp: number}>();
    private cacheTimeout = 60000;

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

    async getNextTicketNumber(game: string): Promise<string> {
        const now = Date.now();
        
        try {
            const getQuery = 'SELECT counter FROM ticket_counters WHERE game = ?';
            let counter = this.db!.prepare(getQuery).get([game]) as { counter: number } | undefined;
            
            if (!counter) {
                const insertQuery = 'INSERT INTO ticket_counters (game, counter, created_at, updated_at) VALUES (?, ?, ?, ?)';
                this.db!.prepare(insertQuery).run([game, 1, now, now]);
                return '1';
            }
            const updateQuery = 'UPDATE ticket_counters SET counter = counter + 1, updated_at = ? WHERE game = ?';
            this.db!.prepare(updateQuery).run([now, game]);
            
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
            this.db!.prepare(query).run([now, game]);
        } catch (error) {
            console.error('Error resetting ticket counter:', error);
            throw error;
        }
    }

    async reconnect(): Promise<void> {
        if (this.db) {
            this.db.close();
        }
        await this.connect();
    }

    // Middleman Methods
    async createMiddlemanRequest(data: {
        ticket_number: string;
        user_id: string;
        user_tag: string;
        channel_id: string;
        game: string;
        trade_details: string;
        trade_value: string;
        other_party?: string;
        contact_method: string;
        status?: string;
    }): Promise<MiddlemanRequestRecord> {
        const now = Date.now();
        const query = `
            INSERT INTO middleman_requests (
                ticket_number, user_id, user_tag, channel_id, game, trade_details,
                trade_value, other_party, contact_method, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        try {
            const result = this.db!.prepare(query).run([
                data.ticket_number, data.user_id, data.user_tag, data.channel_id,
                data.game, data.trade_details, data.trade_value, data.other_party || null,
                data.contact_method, data.status || 'pending', now, now
            ]);

            return this.getMiddlemanRequest(String(result.lastInsertRowid))!;
        } catch (error) {
            console.error('Error creating middleman request:', error);
            throw error;
        }
    }

    async getMiddlemanRequest(requestId: string): Promise<MiddlemanRequestRecord | null> {
        const query = 'SELECT * FROM middleman_requests WHERE id = ? OR ticket_number = ?';
        
        try {
            const row = this.db!.prepare(query).get([requestId, requestId]) as MiddlemanRequestRecord | undefined;
            return row || null;
        } catch (error) {
            console.error('Error getting middleman request:', error);
            throw error;
        }
    }

    async updateMiddlemanRequestStatus(requestId: string, status: string, declineReason?: string): Promise<void> {
        const now = Date.now();
        let query = 'UPDATE middleman_requests SET status = ?, updated_at = ?';
        let params: any[] = [status, now];

        if (declineReason) {
            query += ', decline_reason = ?';
            params.push(declineReason);
        }

        if (status === 'completed') {
            query += ', completed_at = ?';
            params.push(now);
        }

        query += ' WHERE id = ? OR ticket_number = ?';
        params.push(requestId, requestId);

        try {
            this.db!.prepare(query).run(params);
        } catch (error) {
            console.error('Error updating middleman request status:', error);
            throw error;
        }
    }

    async getNextMiddlemanTicketNumber(): Promise<string> {
        const now = Date.now();
        const query = `
            INSERT INTO ticket_counters (game, counter, created_at, updated_at)
            VALUES ('middleman', 1, ?, ?)
            ON CONFLICT(game) 
            DO UPDATE SET 
                counter = counter + 1,
                updated_at = ?
            RETURNING counter
        `;

        try {
            const result = this.db!.prepare(query).get([now, now, now]) as { counter: number };
            return result.counter.toString().padStart(4, '0');
        } catch (error) {
            console.error('Error getting next middleman ticket number:', error);
            throw error;
        }
    }

    async createMiddlemanTransaction(data: {
        request_id: number;
        party1_id: string;
        party1_tag: string;
        party2_id: string;
        party2_tag: string;
        middleman_id: string;
        middleman_tag: string;
        transaction_details: string;
    }): Promise<MiddlemanTransactionRecord> {
        const now = Date.now();
        const query = `
            INSERT INTO middleman_transactions (
                request_id, party1_id, party1_tag, party2_id, party2_tag,
                middleman_id, middleman_tag, transaction_details, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `;

        try {
            const result = this.db!.prepare(query).run([
                data.request_id, data.party1_id, data.party1_tag, data.party2_id, data.party2_tag,
                data.middleman_id, data.middleman_tag, data.transaction_details, now, now
            ]);

            const getQuery = 'SELECT * FROM middleman_transactions WHERE id = ?';
            return this.db!.prepare(getQuery).get([result.lastInsertRowid]) as MiddlemanTransactionRecord;
        } catch (error) {
            console.error('Error creating middleman transaction:', error);
            throw error;
        }
    }

    async completeMiddlemanTransaction(transactionId: string, completionNotes: string, completedBy: string): Promise<void> {
        const now = Date.now();
        const query = `
            UPDATE middleman_transactions 
            SET status = 'completed', completion_notes = ?, updated_at = ?, completed_at = ?
            WHERE id = ?
        `;

        try {
            this.db!.prepare(query).run([completionNotes, now, now, transactionId]);
        } catch (error) {
            console.error('Error completing middleman transaction:', error);
            throw error;
        }
    }

    async createMiddlemanDispute(data: {
        transaction_id: string;
        reporter_id: string;
        reporter_tag: string;
        dispute_reason: string;
        evidence_description?: string;
        status?: string;
    }): Promise<MiddlemanDisputeRecord> {
        const now = Date.now();
        const query = `
            INSERT INTO middleman_disputes (
                transaction_id, reporter_id, reporter_tag, dispute_reason,
                evidence_description, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        try {
            const result = this.db!.prepare(query).run([
                data.transaction_id, data.reporter_id, data.reporter_tag, data.dispute_reason,
                data.evidence_description || null, data.status || 'open', now, now
            ]);

            const getQuery = 'SELECT * FROM middleman_disputes WHERE id = ?';
            return this.db!.prepare(getQuery).get([result.lastInsertRowid]) as MiddlemanDisputeRecord;
        } catch (error) {
            console.error('Error creating middleman dispute:', error);
            throw error;
        }
    }

    async getAllPendingMiddlemanRequests(): Promise<MiddlemanRequestRecord[]> {
        const query = 'SELECT * FROM middleman_requests WHERE status = ? ORDER BY created_at ASC';
        
        try {
            return this.db!.prepare(query).all(['pending']) as MiddlemanRequestRecord[];
        } catch (error) {
            console.error('Error getting pending middleman requests:', error);
            throw error;
        }
    }

    async getActiveMiddlemanTransactions(middlemanId?: string): Promise<MiddlemanTransactionRecord[]> {
        let query = 'SELECT * FROM middleman_transactions WHERE status = ?';
        let params: any[] = ['active'];

        if (middlemanId) {
            query += ' AND middleman_id = ?';
            params.push(middlemanId);
        }

        query += ' ORDER BY created_at ASC';

        try {
            return this.db!.prepare(query).all(params) as MiddlemanTransactionRecord[];
        } catch (error) {
            console.error('Error getting active middleman transactions:', error);
            throw error;
        }
    }

    isHealthy(): boolean {
        if (!this.db || !this.isConnected) return false;
        
        try {
            this.db.prepare('SELECT 1').get();
            return true;
        } catch {
            return false;
        }
    }

    async close(): Promise<void> {
        if (this.db) {
            try {
                this.db.close();
                this.isConnected = false;
                this.preparedStatements.clear();
                this.queryCache.clear();
                console.log('✅ Database connection closed');
                this.emit('disconnected');
            } catch (error) {
                console.error('Error closing database:', error);
                throw error;
            }
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
                databaseInstance?.reconnect().catch(console.error);
            }
        }, 30000);
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