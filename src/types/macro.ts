export interface Macro {
    id: string;
    name: string;
    content: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
}

export interface MacroStorage {
    macros: Macro[];
}

export const STORAGE_KEY = 'macros';

