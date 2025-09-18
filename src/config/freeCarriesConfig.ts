export interface FreeCarryLimits {
    [gamemode: string]: number;
}

export interface GameConfig {
    gameLimits: FreeCarryLimits;
    displayName: string;
}

export const FREE_CARRIES_CONFIG: Record<string, GameConfig> = {
    'av': {
        displayName: 'Anime Vanguards',
        gameLimits: {
            'story': 5,
            'legend-stages': 4,
            'rift': 1,
            'inf': 1,
            'raids': 2,
            'sjw-dungeon': 1,
            'dungeons': 2,
            'portals': 1,
            'void': 1,
            'towers': 1,
            'events': 1
        }
    },
    'als': {
        displayName: 'Anime Last Stand',
        gameLimits: {
            'story': 6,
            'legend-stages': 5,
            'raids': 5,
            'dungeons': 3,
            'survival': 4,
            'breach': 1,
            'portals': 6
        }
    }
};

export function getFreeCarryLimit(game: string, gamemode: string): number {
    const gameConfig = FREE_CARRIES_CONFIG[game];
    if (!gameConfig) {
        return 0;
    }
    
    return gameConfig.gameLimits[gamemode] || 0;
}

export function getAllGamemodeLimits(game: string): FreeCarryLimits | null {
    const gameConfig = FREE_CARRIES_CONFIG[game];
    return gameConfig ? gameConfig.gameLimits : null;
}

export function getGameDisplayName(game: string): string {
    const gameConfig = FREE_CARRIES_CONFIG[game];
    return gameConfig ? gameConfig.displayName : game;
}