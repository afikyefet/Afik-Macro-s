/**
 * Main autocomplete logic for smart macro suggestions
 */

import type { Macro } from '../types/macro';
import { getAllMacros, incrementMacroUsage } from '../utils/storage';
import { processMacroVariables } from '../utils/variables';
import { analyzeFieldContext, matchMacroToContext, fuzzyMatch } from '../utils/context';

interface AutocompleteState {
  active: boolean;
  currentElement: HTMLElement | null;
  query: string;
  suggestions: Macro[];
  selectedIndex: number;
  context: ReturnType<typeof analyzeFieldContext> | null;
  tabCompletionMatch: Macro | null;
}

class MacroAutocomplete {
  private state: AutocompleteState = {
    active: false,
    currentElement: null,
    query: '',
    suggestions: [],
    selectedIndex: 0,
    context: null,
    tabCompletionMatch: null,
  };

  private macros: Macro[] = [];
  private macrosCache: Macro[] = [];
  private cacheTimestamp = 0;
  private readonly CACHE_DURATION = 5000; // 5 seconds
  private overlayContainer: HTMLElement | null = null;
  private isEnabled = true;

  constructor() {
    this.loadMacros();
    this.setupEventListeners();
    this.setupStorageListener();
    this.setupMessageListener();
    this.loadSettings();
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get('autocompleteEnabled');
      this.isEnabled = result.autocompleteEnabled !== false; // Default to true
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  /**
   * Setup message listener for settings changes
   */
  private setupMessageListener(): void {
    // Listen for storage changes to update enabled state
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.autocompleteEnabled) {
        this.setEnabled(changes.autocompleteEnabled.newValue !== false);
      }
    });
  }

  /**
   * Load macros from storage
   */
  private async loadMacros(): Promise<void> {
    try {
      this.macros = await getAllMacros();
      this.macrosCache = this.macros;
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error('Error loading macros:', error);
    }
  }

  /**
   * Get cached macros or refresh if needed
   */
  private async getMacros(): Promise<Macro[]> {
    const now = Date.now();
    if (now - this.cacheTimestamp > this.CACHE_DURATION) {
      await this.loadMacros();
    }
    return this.macrosCache;
  }

  /**
   * Setup storage listener to refresh macros when they change
   */
  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.macros) {
        this.loadMacros();
      }
    });
  }

  /**
   * Setup event listeners for input monitoring
   */
  private setupEventListeners(): void {
    // Monitor focus on input fields
    document.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement;
      if (this.isEditableElement(target)) {
        this.handleFocus(target);
      }
    });

    // Monitor input events
    document.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (this.isEditableElement(target) && target === this.state.currentElement) {
        this.handleInput(target);
      }
    }, true);

    // Monitor keyboard events
    document.addEventListener('keydown', (e) => {
      if (this.state.active && this.state.currentElement) {
        this.handleKeyDown(e);
      }
    }, true);

    // Close overlay on click outside
    document.addEventListener('click', (e) => {
      if (this.state.active && !this.overlayContainer?.contains(e.target as Node)) {
        this.hideOverlay();
      }
    }, true);

    // Monitor blur
    document.addEventListener('focusout', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.state.currentElement) {
        // Delay to allow click events on overlay
        setTimeout(() => {
          if (document.activeElement !== this.state.currentElement) {
            this.hideOverlay();
          }
        }, 200);
      }
    });
  }

  /**
   * Check if element is editable
   */
  private isEditableElement(element: HTMLElement): boolean {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return !element.readOnly && !element.disabled;
    }
    if (element.isContentEditable) {
      return true;
    }
    return false;
  }

  /**
   * Handle focus on input field
   */
  private handleFocus(element: HTMLElement): void {
    if (!this.isEnabled) return;

    this.state.currentElement = element;
    this.state.context = analyzeFieldContext(element);
    this.state.query = '';
    this.updateSuggestions();
  }

  /**
   * Handle input in field
   */
  private handleInput(element: HTMLElement): void {
    if (!this.isEnabled) return;

    const query = this.getCurrentText(element);
    this.state.query = query;

    // Check for Tab completion match
    this.checkTabCompletion(query);

    // Update suggestions
    this.updateSuggestions();
  }

  /**
   * Get current text from element
   */
  private getCurrentText(element: HTMLElement): string {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const start = element.selectionStart || 0;
      const value = element.value.substring(0, start);
      // Extract last word or phrase
      const words = value.split(/\s+/);
      return words[words.length - 1] || '';
    }
    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const textNode = range.startContainer;
        if (textNode.nodeType === Node.TEXT_NODE) {
          const text = textNode.textContent || '';
          const offset = range.startOffset;
          const beforeCursor = text.substring(0, offset);
          const words = beforeCursor.split(/\s+/);
          return words[words.length - 1] || '';
        }
      }
    }
    return '';
  }

  /**
   * Check for Tab completion match
   */
  private checkTabCompletion(query: string): void {
    if (!query || query.length < 2) {
      this.state.tabCompletionMatch = null;
      return;
    }

    const match = this.macrosCache.find((macro) => {
      const nameMatch = fuzzyMatch(query, macro.name);
      return nameMatch >= 60; // Good match threshold
    });

    this.state.tabCompletionMatch = match || null;
  }

  /**
   * Update suggestions based on current query and context
   */
  private async updateSuggestions(): Promise<void> {
    const macros = await this.getMacros();
    const query = this.state.query.toLowerCase().trim();

    let filtered: Array<{ macro: Macro; score: number }> = [];

    for (const macro of macros) {
      let score = 0;

      // Text matching score
      if (query) {
        const nameMatch = fuzzyMatch(query, macro.name);
        const contentMatch = fuzzyMatch(query, macro.content);
        score += Math.max(nameMatch, contentMatch * 0.5);
      } else {
        // If no query, use context matching
        if (this.state.context) {
          score = matchMacroToContext(macro, this.state.context);
        } else {
          // Default: show most used macros
          score = (macro.usageCount || 0) * 0.1;
        }
      }

      // Context boost
      if (this.state.context) {
        score += matchMacroToContext(macro, this.state.context) * 0.3;
      }

      // Usage boost
      score += (macro.usageCount || 0) * 0.05;

      if (score > 0 || !query) {
        filtered.push({ macro, score });
      }
    }

    // Sort by score and limit results
    filtered.sort((a, b) => b.score - a.score);
    this.state.suggestions = filtered.slice(0, 5).map((item) => item.macro);
    this.state.selectedIndex = 0;

    // Show/hide overlay
    if (this.state.suggestions.length > 0 && this.state.currentElement) {
      this.showOverlay();
    } else {
      this.hideOverlay();
    }
  }

  /**
   * Handle keyboard events
   */
  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.state.active) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.state.selectedIndex = Math.min(
          this.state.selectedIndex + 1,
          this.state.suggestions.length - 1
        );
        this.updateOverlay();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.state.selectedIndex = Math.max(this.state.selectedIndex - 1, 0);
        this.updateOverlay();
        break;

      case 'Enter':
        e.preventDefault();
        if (this.state.suggestions[this.state.selectedIndex]) {
          this.insertMacro(this.state.suggestions[this.state.selectedIndex]);
        }
        break;

      case 'Tab':
        // Handle Tab completion
        if (this.state.tabCompletionMatch && !e.shiftKey) {
          e.preventDefault();
          this.insertMacro(this.state.tabCompletionMatch, true);
        }
        break;

      case 'Escape':
        e.preventDefault();
        this.hideOverlay();
        break;
    }
  }

  /**
   * Insert macro into current element
   */
  private async insertMacro(macro: Macro, isTabCompletion = false): Promise<void> {
    if (!this.state.currentElement) return;

    try {
      const processedContent = await processMacroVariables(macro.content);
      const element = this.state.currentElement;

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const start = element.selectionStart || 0;
        const end = element.selectionEnd || 0;
        const value = element.value;

        if (isTabCompletion && this.state.query) {
          // Replace the query text with macro content
          const queryStart = start - this.state.query.length;
          const beforeQuery = value.substring(0, queryStart);
          const afterSelection = value.substring(end);
          element.value = beforeQuery + processedContent + afterSelection;
          element.selectionStart = element.selectionEnd = queryStart + processedContent.length;
        } else {
          // Insert at cursor
          element.value = value.substring(0, start) + processedContent + value.substring(end);
          element.selectionStart = element.selectionEnd = start + processedContent.length;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.focus();
      } else if (element.isContentEditable) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (isTabCompletion && this.state.query) {
            // Delete query text
            const queryStart = range.startOffset - this.state.query.length;
            range.setStart(range.startContainer, Math.max(0, queryStart));
            range.deleteContents();
          } else {
            range.deleteContents();
          }
          range.insertNode(document.createTextNode(processedContent));
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Track usage
      await incrementMacroUsage(macro.id);
      this.trackContextUsage(macro);

      this.hideOverlay();
    } catch (error) {
      console.error('Error inserting macro:', error);
    }
  }

  /**
   * Track macro usage in context
   */
  private async trackContextUsage(macro: Macro): Promise<void> {
    if (!this.state.context) return;

    const contextKey = `${this.state.context.domain}:${this.state.context.fieldType}`;
    
    // Use storage utility to track context
    const { trackMacroContextUsage } = await import('../utils/storage');
    await trackMacroContextUsage(
      macro.id,
      contextKey,
      this.state.context.fieldType,
      this.state.context.domain
    );

    // Refresh cache
    await this.loadMacros();
  }

  /**
   * Show overlay with suggestions
   */
  private showOverlay(): void {
    if (!this.state.currentElement) return;

    this.state.active = true;
    const position = this.calculatePosition(this.state.currentElement);
    this.renderOverlay(position);
  }

  /**
   * Hide overlay
   */
  private hideOverlay(): void {
    this.state.active = false;
    this.state.tabCompletionMatch = null;
    if (this.overlayContainer) {
      this.overlayContainer.remove();
      this.overlayContainer = null;
    }
  }

  /**
   * Update overlay position and content
   */
  private updateOverlay(): void {
    if (this.state.active && this.state.currentElement) {
      const position = this.calculatePosition(this.state.currentElement);
      this.renderOverlay(position);
    }
  }

  /**
   * Calculate overlay position relative to input field
   */
  private calculatePosition(element: HTMLElement): { top: number; left: number } {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
    };
  }

  /**
   * Render overlay using DOM
   */
  private renderOverlay(position: { top: number; left: number }): void {
    // Remove existing overlay
    if (this.overlayContainer) {
      this.overlayContainer.remove();
    }

    // Create container
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'macro-suggestion-overlay';
    this.overlayContainer.style.cssText = `
      position: fixed;
      z-index: 999999;
      top: ${position.top}px;
      left: ${position.left}px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 300px;
      max-width: 400px;
      max-height: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid #e0e0e0;
      background: #f8f9fa;
    `;
    const title = document.createElement('span');
    title.textContent = 'Macro Suggestions';
    title.style.cssText = 'font-weight: 600; color: #333; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background: none; border: none; font-size: 20px; cursor: pointer; color: #666; padding: 0; width: 20px; height: 20px;';
    closeBtn.onclick = () => this.hideOverlay();
    header.appendChild(title);
    header.appendChild(closeBtn);

    // List
    const list = document.createElement('div');
    list.style.cssText = 'overflow-y: auto; max-height: 350px;';

    this.state.suggestions.forEach((macro, index) => {
      const item = document.createElement('div');
      item.className = `suggestion-item ${index === this.state.selectedIndex ? 'selected' : ''}`;
      item.style.cssText = `
        padding: 10px 12px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        transition: background-color 0.15s;
        ${index === this.state.selectedIndex ? 'background: #f0f7ff;' : ''}
      `;
      item.onmouseenter = () => {
        this.state.selectedIndex = index;
        this.updateOverlay();
      };
      item.onclick = () => this.insertMacro(macro);

      const name = document.createElement('div');
      name.style.cssText = 'font-weight: 600; color: #333; margin-bottom: 4px; font-size: 14px;';
      name.textContent = macro.name;

      const preview = document.createElement('div');
      preview.style.cssText = 'color: #666; font-size: 12px; margin-bottom: 4px; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      preview.textContent = macro.content.length > 50 ? `${macro.content.substring(0, 50)}...` : macro.content;

      item.appendChild(name);
      item.appendChild(preview);

      if (macro.tags.length > 0) {
        const tags = document.createElement('div');
        tags.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;';
        macro.tags.slice(0, 2).forEach((tag) => {
          const tagEl = document.createElement('span');
          tagEl.textContent = tag;
          tagEl.style.cssText = 'background: #e9ecef; color: #495057; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 500;';
          tags.appendChild(tagEl);
        });
        item.appendChild(tags);
      }

      list.appendChild(item);
    });

    this.overlayContainer.appendChild(header);
    this.overlayContainer.appendChild(list);
    document.body.appendChild(this.overlayContainer);

    // Scroll selected into view
    const selectedItem = list.children[this.state.selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Enable/disable autocomplete
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.hideOverlay();
    }
  }
}

// Initialize autocomplete
let autocompleteInstance: MacroAutocomplete | null = null;

export function initializeAutocomplete(): void {
  if (!autocompleteInstance) {
    autocompleteInstance = new MacroAutocomplete();
  }
}

export function getAutocompleteInstance(): MacroAutocomplete | null {
  return autocompleteInstance;
}

