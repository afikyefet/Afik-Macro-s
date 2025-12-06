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
  };
}

