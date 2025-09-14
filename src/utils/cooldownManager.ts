interface CooldownEntry {
    expiresAt: number;
    type: 'ticket' | 'carry_request';
}

class CooldownManager {
    private cooldowns: Map<string, CooldownEntry> = new Map();
    
    private readonly COOLDOWN_DURATIONS = {
        ticket: 30 * 1000,
        carry_request: 10 * 60 * 1000,
    } as const;

    isOnCooldown(userId: string, type: 'ticket' | 'carry_request'): boolean {
        const key = `${userId}_${type}`;
        const cooldown = this.cooldowns.get(key);
        
        if (!cooldown) return false;
        
        if (Date.now() > cooldown.expiresAt) {
            this.cooldowns.delete(key);
            return false;
        }
        
        return true;
    }

    getRemainingCooldown(userId: string, type: 'ticket' | 'carry_request'): number {
        const key = `${userId}_${type}`;
        const cooldown = this.cooldowns.get(key);
        
        if (!cooldown) return 0;
        
        const remaining = cooldown.expiresAt - Date.now();
        return remaining > 0 ? remaining : 0;
    }

    setCooldown(userId: string, type: 'ticket' | 'carry_request'): void {
        const key = `${userId}_${type}`;
        const duration = this.COOLDOWN_DURATIONS[type];
        
        this.cooldowns.set(key, {
            expiresAt: Date.now() + duration,
            type
        });
    }

    formatRemainingTime(milliseconds: number): string {
        const seconds = Math.ceil(milliseconds / 1000);
        
        if (seconds < 60) {
            return `${seconds} second${seconds !== 1 ? 's' : ''}`;
        }
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (remainingSeconds === 0) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
        
        return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
    }

    cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];
        
        for (const [key, cooldown] of this.cooldowns.entries()) {
            if (now > cooldown.expiresAt) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.cooldowns.delete(key));
    }

    getStats(): { totalCooldowns: number, ticketCooldowns: number, carryRequestCooldowns: number } {
        let ticketCooldowns = 0;
        let carryRequestCooldowns = 0;
        
        for (const cooldown of this.cooldowns.values()) {
            if (cooldown.type === 'ticket') {
                ticketCooldowns++;
            } else {
                carryRequestCooldowns++;
            }
        }
        
        return {
            totalCooldowns: this.cooldowns.size,
            ticketCooldowns,
            carryRequestCooldowns
        };
    }
}

export const cooldownManager = new CooldownManager();

setInterval(() => {
    cooldownManager.cleanup();
}, 5 * 60 * 1000);