export interface Macro {
    id: string;
    name: string;
    content: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
    usageCount?: number;
    lastUsed?: number;
    // Context metadata for smart suggestions
    fieldTypes?: string[]; // e.g., ['email', 'name', 'address']
    domains?: string[]; // e.g., ['gmail.com', 'github.com']
    contextUsage?: Record<string, number>; // Track usage by context (domain + fieldType)
}

export interface MacroStorage {
    macros: Macro[];
}

export const STORAGE_KEY = 'macros';

