import type { Macro, MacroStorage } from '../types/macro';
import { STORAGE_KEY } from '../types/macro';

/**
 * Get all macros from storage
 */
export async function getAllMacros(): Promise<Macro[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      const storage = result[STORAGE_KEY] as MacroStorage | undefined;
      resolve(storage?.macros || []);
    });
  });
}

/**
 * Save a macro to storage
 */
export async function saveMacro(macro: Macro): Promise<void> {
  const macros = await getAllMacros();
  const existingIndex = macros.findIndex((m) => m.id === macro.id);
  
  if (existingIndex >= 0) {
    macros[existingIndex] = macro;
  } else {
    macros.push(macro);
  }
  
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: { macros } }, () => {
      resolve();
    });
  });
}

/**
 * Delete a macro by ID
 */
export async function deleteMacro(id: string): Promise<void> {
  const macros = await getAllMacros();
  const filtered = macros.filter((m) => m.id !== id);
  
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: { macros: filtered } }, () => {
      resolve();
    });
  });
}

/**
 * Get all unique tags from all macros
 */
export async function getAllTags(): Promise<string[]> {
  const macros = await getAllMacros();
  const tagSet = new Set<string>();
  macros.forEach((macro) => {
    macro.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

/**
 * Create a new macro with generated ID
 */
export function createMacro(name: string, content: string, tags: string[] = []): Macro {
  return {
    id: `macro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    content,
    tags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
    lastUsed: undefined,
  };
}

/**
 * Increment usage count and update last used timestamp
 */
export async function incrementMacroUsage(id: string): Promise<void> {
  const macros = await getAllMacros();
  const macro = macros.find((m) => m.id === id);
  
  if (macro) {
    macro.usageCount = (macro.usageCount || 0) + 1;
    macro.lastUsed = Date.now();
    await saveMacro(macro);
  }
}

/**
 * Export all macros as JSON string
 */
export async function exportMacros(): Promise<string> {
  const macros = await getAllMacros();
  return JSON.stringify({ macros, exportedAt: Date.now() }, null, 2);
}

/**
 * Import macros from JSON string
 */
export async function importMacros(json: string, merge: boolean = true): Promise<number> {
  try {
    const data = JSON.parse(json);
    if (!data.macros || !Array.isArray(data.macros)) {
      throw new Error("Invalid macro data format");
    }

    const existingMacros = merge ? await getAllMacros() : [];
    const existingIds = new Set(existingMacros.map((m) => m.id));
    
    // Filter out duplicates if merging
    const newMacros = merge
      ? data.macros.filter((m: Macro) => !existingIds.has(m.id))
      : data.macros;

    // Generate new IDs for imported macros to avoid conflicts
    const importedMacros = newMacros.map((macro: Macro) => ({
      ...macro,
      id: `macro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: macro.createdAt || Date.now(),
      updatedAt: Date.now(),
      usageCount: macro.usageCount || 0,
    }));

    const allMacros = merge ? [...existingMacros, ...importedMacros] : importedMacros;

    return new Promise((resolve) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: { macros: allMacros } }, () => {
        resolve(importedMacros.length);
      });
    });
  } catch (error) {
    console.error("Error importing macros:", error);
    throw error;
  }
}

