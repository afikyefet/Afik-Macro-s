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
  private inlineSuggestionContainer: HTMLElement | null = null;
  private inlineSuggestionContent: HTMLElement | null = null;
  private isEnabled = true;
  private isInserting = false; // Flag to prevent overlay closing during insertion
  private lastInputTime = 0; // Track timing of input events
  private lastInputWasHuman = false; // Track if last input was human typing
  private focusTimeout: number | null = null; // Timeout to delay overlay on focus
  private isMinimized = false; // Whether overlay is minimized to icon
  private dismissedForCurrentInput = false; // Whether user dismissed overlay for current input field
  private userExpandedForCurrentInput = false; // Track user expansion per input
  private focusToken = 0; // Guard against stale focus timeouts

  constructor() {
    this.injectStyles();
    this.loadMacros();
    this.setupEventListeners();
    this.setupStorageListener();
    this.setupMessageListener();
    this.loadSettings();
  }

  /**
   * Inject CSS styles into the page
   */
  private injectStyles(): void {
    // Check if styles already injected
    if (document.getElementById('macro-autocomplete-styles')) {
      return;
    }

    // Inject CSS as style tag (since overlay is in document body, not shadow DOM)
    const style = document.createElement('style');
    style.id = 'macro-autocomplete-styles';
    style.textContent = `
      .macro-suggestion-overlay {
        position: fixed;
        z-index: 999999;
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
      }
      .suggestion-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid #e0e0e0;
        background: #f8f9fa;
      }
      .suggestion-title {
        font-weight: 600;
        color: #333;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .close-button {
        background: none;
        border: none;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      }
      .close-button:hover {
        background: #e0e0e0;
        color: #333;
      }
      .suggestion-list {
        overflow-y: auto;
        max-height: 350px;
      }
      .suggestion-item {
        padding: 10px 12px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        transition: background-color 0.15s;
      }
      .suggestion-item:hover,
      .suggestion-item.selected {
        background: #f0f7ff;
      }
      .suggestion-item:last-child {
        border-bottom: none;
      }
      .suggestion-name {
        font-weight: 600;
        color: #333;
        margin-bottom: 4px;
        font-size: 14px;
      }
      .suggestion-preview {
        color: #666;
        font-size: 12px;
        margin-bottom: 4px;
        line-height: 1.4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .suggestion-tags {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-top: 4px;
      }
      .suggestion-tag {
        background: #e9ecef;
        color: #495057;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 500;
      }
      .macro-suggestion-overlay.minimized {
        min-width: auto;
        max-width: none;
        max-height: none;
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 0;
      }
      .minimized-icon {
        width: 32px;
        height: 32px;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 18px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        transition: all 0.2s ease;
      }
      .minimized-icon:hover {
        background: #f8f9fa;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        transform: scale(1.1);
      }
      .macro-inline-suggestion {
        position: fixed;
        z-index: 999998;
        pointer-events: none;
        color: transparent;
        background: transparent;
        overflow: hidden;
        box-sizing: border-box;
      }
      .macro-inline-suggestion-content {
        white-space: pre;
      }
      .macro-inline-suggestion .ghost-base {
        color: transparent;
      }
      .macro-inline-suggestion .ghost-suffix {
        color: rgba(60, 60, 60, 0.4);
      }
      @media (prefers-color-scheme: dark) {
        .macro-suggestion-overlay {
          background: #2d2d2d;
          border-color: #404040;
          color: #e0e0e0;
        }
        .suggestion-header {
          background: #1f1f1f;
          border-bottom-color: #404040;
        }
        .suggestion-title {
          color: #e0e0e0;
        }
        .close-button {
          color: #999;
        }
        .close-button:hover {
          background: #404040;
          color: #e0e0e0;
        }
        .suggestion-item {
          border-bottom-color: #404040;
        }
        .suggestion-item:hover,
        .suggestion-item.selected {
          background: #1a3a5c;
        }
        .suggestion-name {
          color: #e0e0e0;
        }
        .suggestion-preview {
          color: #b0b0b0;
        }
        .suggestion-tag {
          background: #404040;
          color: #b0b0b0;
        }
        .macro-suggestion-overlay.minimized {
          background: transparent;
          border: none;
        }
        .minimized-icon {
          background: #2d2d2d;
          border-color: #404040;
          color: #e0e0e0;
        }
        .minimized-icon:hover {
          background: #404040;
        }
        .macro-inline-suggestion .ghost-suffix {
          color: rgba(224, 224, 224, 0.4);
        }
      }
    `;
    document.head.appendChild(style);
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
        // Reset state immediately for the newly focused element
        this.state.currentElement = target;
        this.state.context = analyzeFieldContext(target);
        this.state.query = '';
        this.dismissedForCurrentInput = false;
        this.isMinimized = false;
        this.userExpandedForCurrentInput = false;
        this.clearInlineSuggestion();

        this.focusToken += 1;
        const token = this.focusToken;

        // Delay overlay to avoid flicker on focus
        if (this.focusTimeout) {
          clearTimeout(this.focusTimeout);
        }
        this.focusTimeout = window.setTimeout(() => {
          if (this.focusToken !== token) return;
          if (document.activeElement !== target) return;
          this.handleFocus(target);
        }, 300); // 300ms delay to allow browser autocomplete to complete
      }
    });

    // Monitor input events
    document.addEventListener('input', (e) => {
      const target = e.target as HTMLElement;
      if (this.isEditableElement(target) && target === this.state.currentElement) {
        // Detect if input is from human typing vs programmatic (autocomplete, paste, etc.)
        const now = Date.now();
        const timeSinceLastInput = now - this.lastInputTime;
        const isHumanTyping = timeSinceLastInput > 50 && timeSinceLastInput < 2000; // Human typing is typically 50-2000ms between keystrokes
        
        // Check if this looks like browser autocomplete (rapid value change without recent typing)
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          const valueLength = target.value.length;
          const wasEmpty = (this.state.currentElement as HTMLInputElement | HTMLTextAreaElement)?.value.length === 0;
          
          // Browser autocomplete typically fills the field quickly when it's empty
          if (wasEmpty && valueLength > 0 && !this.lastInputWasHuman && timeSinceLastInput > 100) {
            // Likely browser autocomplete - don't show overlay
            this.lastInputTime = now;
            this.lastInputWasHuman = false;
            return;
          }
        }
        
        this.lastInputTime = now;
        this.lastInputWasHuman = isHumanTyping;
        this.handleInput(target);
      }
    }, true);
    
    // Monitor keyboard events to detect human typing
    document.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      if (this.isEditableElement(target) && target === this.state.currentElement) {
        // Mark as human input if it's a printable character
        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
          this.lastInputWasHuman = true;
          this.lastInputTime = Date.now();
        }
      }
    }, true);
    
    // Monitor paste events
    document.addEventListener('paste', (e) => {
      const target = e.target as HTMLElement;
      if (this.isEditableElement(target) && target === this.state.currentElement) {
        this.lastInputWasHuman = false; // Paste is not human typing
        this.lastInputTime = Date.now();
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
      const target = e.target as Node;
      const clickedInsideOverlay = this.overlayContainer?.contains(target);
      // Don't close if clicking inside overlay or if insertion is in progress
      if (this.state.active && !clickedInsideOverlay && !this.isInserting) {
        this.hideOverlay();
      }
    }, true);

    // Monitor blur
    document.addEventListener('focusout', (e) => {
      const target = e.target as HTMLElement;
      if (target === this.state.currentElement) {
        // Clear focus timeout if element loses focus
        if (this.focusTimeout) {
          clearTimeout(this.focusTimeout);
          this.focusTimeout = null;
        }
        // Delay to allow click events on overlay and prevent closing during insertion
        setTimeout(() => {
          // Don't close if clicking on overlay or if insertion is in progress
          const relatedTarget = (e as FocusEvent).relatedTarget as HTMLElement;
          const clickedOverlay = relatedTarget && this.overlayContainer?.contains(relatedTarget);
          if (document.activeElement !== this.state.currentElement && !clickedOverlay && !this.isInserting) {
            this.hideOverlay();
          }
        }, 300);
      }
    });

    window.addEventListener('resize', () => {
      this.updateInlineSuggestion();
    });

    window.addEventListener('scroll', () => {
      this.updateInlineSuggestion();
      this.updateOverlay();
    }, true);
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
    if (element !== this.state.currentElement) return;
    if (document.activeElement !== element) return;
    
    // Check if field already has value (might be from autocomplete)
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.value.length > 0) {
        // Field has value - wait a bit to see if it's from autocomplete
        setTimeout(() => {
          if (element !== this.state.currentElement) return;
          if (document.activeElement !== element) return;
          // If value changed after focus, it's likely autocomplete
          if (element.value.length > 0 && !this.lastInputWasHuman) {
            return; // Don't show overlay for autocompleted fields
          }
          // Only show overlay if field is empty or user is typing
          if (element.value.length === 0 || this.lastInputWasHuman) {
            this.updateSuggestions();
          }
        }, 500); // Wait 500ms to detect autocomplete
        return;
      }
    }
    
    // Empty field - show suggestions after a short delay to avoid flicker
    setTimeout(() => {
      if (element !== this.state.currentElement) return;
      if (document.activeElement !== element) return;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        if (element.value.length === 0) {
          this.updateSuggestions();
        }
        return;
      }
      this.updateSuggestions();
    }, 200);
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
      this.updateInlineSuggestion();
      return;
    }

    const match = this.macrosCache.find((macro) => {
      const nameMatch = fuzzyMatch(query, macro.name);
      return nameMatch >= 60; // Good match threshold
    });

    this.state.tabCompletionMatch = match || null;
    this.updateInlineSuggestion();
  }

  /**
   * Update suggestions based on current query and context
   */
  private async updateSuggestions(): Promise<void> {
    // Don't show overlay if dismissed for current input
    if (this.dismissedForCurrentInput) {
      return;
    }

    const macros = await this.getMacros();
    const query = this.state.query.toLowerCase().trim();

    let filtered: Array<{ macro: Macro; score: number }> = [];
    const CONTEXT_THRESHOLD = 30; // Minimum score for empty query (requires strong context match)
    const MATCH_THRESHOLD = 20; // Minimum score for typed query

    for (const macro of macros) {
      let score = 0;

      // Text matching score
      if (query) {
        const nameMatch = fuzzyMatch(query, macro.name);
        const contentMatch = fuzzyMatch(query, macro.content);
        score += Math.max(nameMatch, contentMatch * 0.5);
      } else {
        // If no query, require strong context match (not just usage count)
        if (this.state.context) {
          score = matchMacroToContext(macro, this.state.context);
          // Only boost with usage if we have a context match
          if (score > 0) {
            score += (macro.usageCount || 0) * 0.1;
          }
        } else {
          // No context - don't show suggestions for empty query
          score = 0;
        }
      }

      // Context boost (only if we have a query)
      if (query && this.state.context) {
        score += matchMacroToContext(macro, this.state.context) * 0.3;
      }

      // Usage boost (only if we have a query)
      if (query) {
        score += (macro.usageCount || 0) * 0.05;
      }

      // Apply threshold based on query
      const threshold = query ? MATCH_THRESHOLD : CONTEXT_THRESHOLD;
      if (score > threshold) {
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
    if (!this.state.active || this.isMinimized) return;

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
  private async insertMacro(macro: Macro, isTabCompletion = false, elementOverride?: HTMLElement): Promise<void> {
    // Use provided element or fall back to currentElement
    const element = elementOverride || this.state.currentElement;
    if (!element) {
      return;
    }

    // Set flag to prevent overlay from closing during insertion
    this.isInserting = true;

    try {
      const processedContent = await processMacroVariables(macro.content);

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
        } else if (this.state.query && start > 0) {
          // When clicking overlay, replace the query text if it exists
          // The query is the last word/phrase before cursor (extracted by getCurrentText)
          // Find where the query text starts by looking for it at the end of text before cursor
          const textBeforeCursor = value.substring(0, start);
          const queryLength = this.state.query.length;
          
          // Check if the query text appears at the end of text before cursor
          if (textBeforeCursor.length >= queryLength) {
            const potentialQuery = textBeforeCursor.substring(textBeforeCursor.length - queryLength);
            // Match if exact match or if query is contained in the last part
            if (potentialQuery.toLowerCase() === this.state.query.toLowerCase() ||
                textBeforeCursor.toLowerCase().endsWith(this.state.query.toLowerCase())) {
              const queryStart = start - queryLength;
              const beforeQuery = value.substring(0, queryStart);
              const afterSelection = value.substring(end);
              element.value = beforeQuery + processedContent + afterSelection;
              element.selectionStart = element.selectionEnd = queryStart + processedContent.length;
            } else {
              // Insert at cursor
              element.value = value.substring(0, start) + processedContent + value.substring(end);
              element.selectionStart = element.selectionEnd = start + processedContent.length;
            }
          } else {
            // Insert at cursor
            element.value = value.substring(0, start) + processedContent + value.substring(end);
            element.selectionStart = element.selectionEnd = start + processedContent.length;
          }
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
    } finally {
      // Clear insertion flag
      this.isInserting = false;
      // Restore focus to the input element
      if (element && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        element.focus();
      }
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
    if (document.activeElement !== this.state.currentElement) return;

    this.state.active = true;
    if (!this.userExpandedForCurrentInput) {
      this.isMinimized = false;
    }
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
    this.clearInlineSuggestion();
  }

  /**
   * Dismiss overlay for current input (user clicked close)
   */
  private dismissOverlay(): void {
    this.dismissedForCurrentInput = true;
    this.hideOverlay();
  }

  /**
   * Toggle minimized state
   */
  private toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    if (!this.isMinimized) {
      this.userExpandedForCurrentInput = true;
    }
    if (this.state.active && this.state.currentElement) {
      const position = this.calculatePosition(this.state.currentElement);
      this.renderOverlay(position);
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
      top: rect.bottom + 4,
      left: rect.left,
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

    // If minimized, render minimized icon
    if (this.isMinimized) {
      this.renderMinimizedOverlay(position);
      return;
    }

    // Create container
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'macro-suggestion-overlay';
    this.overlayContainer.style.cssText = `
      position: fixed;
      z-index: 999999;
      top: ${position.top}px;
      left: ${position.left}px;
    `;
    // Stop clicks inside overlay from bubbling to document
    this.overlayContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    }, true);

    // Header
    const header = document.createElement('div');
    header.className = 'suggestion-header';
    const title = document.createElement('span');
    title.className = 'suggestion-title';
    title.textContent = 'Macro Suggestions';
    
    const controls = document.createElement('div');
    controls.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    
    // Minimize button
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'close-button';
    minimizeBtn.textContent = '−';
    minimizeBtn.title = 'Minimize';
    minimizeBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    };
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.dismissOverlay();
    };
    
    controls.appendChild(minimizeBtn);
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);

    // List
    const list = document.createElement('div');
    list.className = 'suggestion-list';

    this.state.suggestions.forEach((macro, index) => {
      const item = document.createElement('div');
      item.className = `suggestion-item ${index === this.state.selectedIndex ? 'selected' : ''}`;
      item.onmouseenter = () => {
        this.state.selectedIndex = index;
        this.updateOverlay();
      };
      // Use mousedown instead of click to fire before focusout
      item.onmousedown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        // Store reference to element before async operation
        const elementToUse = this.state.currentElement;
        if (elementToUse) {
          // Use setTimeout to ensure mousedown completes before insertion
          setTimeout(() => {
            this.insertMacro(macro, false, elementToUse);
          }, 0);
        }
      };

      const name = document.createElement('div');
      name.className = 'suggestion-name';
      name.textContent = macro.name;

      const preview = document.createElement('div');
      preview.className = 'suggestion-preview';
      preview.textContent = macro.content.length > 50 ? `${macro.content.substring(0, 50)}...` : macro.content;

      item.appendChild(name);
      item.appendChild(preview);

      if (macro.tags.length > 0) {
        const tags = document.createElement('div');
        tags.className = 'suggestion-tags';
        macro.tags.slice(0, 2).forEach((tag) => {
          const tagEl = document.createElement('span');
          tagEl.className = 'suggestion-tag';
          tagEl.textContent = tag;
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
   * Render minimized overlay (icon only)
   */
  private renderMinimizedOverlay(position: { top: number; left: number }): void {
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'macro-suggestion-overlay minimized';
    this.overlayContainer.style.cssText = `
      position: fixed;
      z-index: 999999;
      top: ${position.top}px;
      left: ${position.left}px;
    `;
    
    const icon = document.createElement('div');
    icon.className = 'minimized-icon';
    icon.innerHTML = 'M';
    icon.title = 'Click to expand macro suggestions';
    icon.onclick = (e) => {
      e.stopPropagation();
      this.toggleMinimize();
    };
    
    this.overlayContainer.appendChild(icon);
    document.body.appendChild(this.overlayContainer);
  }

  /**
   * Update inline suggestion ghost text for input/textarea elements
   */
  private updateInlineSuggestion(): void {
    const element = this.state.currentElement;
    if (!this.isEnabled || this.dismissedForCurrentInput) {
      this.clearInlineSuggestion();
      return;
    }
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      this.clearInlineSuggestion();
      return;
    }

    if (!this.state.tabCompletionMatch || !this.state.query) {
      this.clearInlineSuggestion();
      return;
    }

    const value = element.value;
    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? start;
    if (start !== end) {
      this.clearInlineSuggestion();
      return;
    }

    const textBeforeCursor = value.substring(0, start);
    const textAfterCursor = value.substring(end);
    const query = this.state.query;
    const queryStart = textBeforeCursor.length - query.length;
    if (queryStart < 0) {
      this.clearInlineSuggestion();
      return;
    }

    const macroContent = this.state.tabCompletionMatch.content;
    if (!macroContent.toLowerCase().startsWith(query.toLowerCase())) {
      this.clearInlineSuggestion();
      return;
    }

    const remainder = macroContent.substring(query.length);
    if (!remainder) {
      this.clearInlineSuggestion();
      return;
    }

    if (!this.inlineSuggestionContainer || !this.inlineSuggestionContent) {
      this.inlineSuggestionContainer = document.createElement('div');
      this.inlineSuggestionContainer.className = 'macro-inline-suggestion';
      this.inlineSuggestionContent = document.createElement('div');
      this.inlineSuggestionContent.className = 'macro-inline-suggestion-content';
      this.inlineSuggestionContainer.appendChild(this.inlineSuggestionContent);
      document.body.appendChild(this.inlineSuggestionContainer);
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const isTextarea = element instanceof HTMLTextAreaElement;

    this.inlineSuggestionContainer.style.top = `${rect.top}px`;
    this.inlineSuggestionContainer.style.left = `${rect.left}px`;
    this.inlineSuggestionContainer.style.width = `${rect.width}px`;
    this.inlineSuggestionContainer.style.height = `${rect.height}px`;
    this.inlineSuggestionContainer.style.padding = style.padding;
    this.inlineSuggestionContainer.style.borderRadius = style.borderRadius;
    this.inlineSuggestionContainer.style.font = style.font;
    this.inlineSuggestionContainer.style.letterSpacing = style.letterSpacing;
    this.inlineSuggestionContainer.style.textAlign = style.textAlign;
    this.inlineSuggestionContainer.style.lineHeight = style.lineHeight;
    this.inlineSuggestionContainer.style.textTransform = style.textTransform;
    this.inlineSuggestionContainer.style.textIndent = style.textIndent;
    this.inlineSuggestionContainer.style.boxSizing = style.boxSizing;

    this.inlineSuggestionContent.style.whiteSpace = isTextarea ? 'pre-wrap' : 'pre';
    this.inlineSuggestionContent.style.wordBreak = isTextarea ? 'break-word' : 'normal';
    this.inlineSuggestionContent.style.transform = `translate(${-element.scrollLeft}px, ${-element.scrollTop}px)`;

    this.inlineSuggestionContent.textContent = '';
    const baseSpan = document.createElement('span');
    baseSpan.className = 'ghost-base';
    baseSpan.textContent = textBeforeCursor;
    const ghostSpan = document.createElement('span');
    ghostSpan.className = 'ghost-suffix';
    ghostSpan.textContent = remainder;
    const tailSpan = document.createElement('span');
    tailSpan.className = 'ghost-base';
    tailSpan.textContent = textAfterCursor;

    this.inlineSuggestionContent.appendChild(baseSpan);
    this.inlineSuggestionContent.appendChild(ghostSpan);
    this.inlineSuggestionContent.appendChild(tailSpan);
  }

  /**
   * Clear inline suggestion element
   */
  private clearInlineSuggestion(): void {
    if (this.inlineSuggestionContainer) {
      this.inlineSuggestionContainer.remove();
      this.inlineSuggestionContainer = null;
      this.inlineSuggestionContent = null;
    }
  }

  /**
   * Enable/disable autocomplete
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.hideOverlay();
      this.clearInlineSuggestion();
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

