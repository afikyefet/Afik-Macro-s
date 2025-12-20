/**
 * Context detection utilities for smart macro suggestions
 */

export interface FieldContext {
  fieldType: string;
  fieldName: string;
  placeholder: string;
  label: string;
  domain: string;
}

/**
 * Detect field type from input element
 */
export function detectFieldType(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    // Check input type
    const inputType = element.type?.toLowerCase();
    if (inputType && inputType !== 'text') {
      return inputType; // email, tel, password, etc.
    }

    // Check name/id attributes
    const name = (element.name || element.id || '').toLowerCase();
    const namePatterns: Record<string, string> = {
      email: 'email',
      mail: 'email',
      phone: 'tel',
      telephone: 'tel',
      mobile: 'tel',
      name: 'name',
      firstname: 'name',
      lastname: 'name',
      fullname: 'name',
      address: 'address',
      street: 'address',
      city: 'address',
      zip: 'address',
      postal: 'address',
      message: 'message',
      comment: 'message',
      description: 'message',
      body: 'message',
      subject: 'subject',
      title: 'subject',
    };

    for (const [pattern, type] of Object.entries(namePatterns)) {
      if (name.includes(pattern)) {
        return type;
      }
    }

    // Check placeholder
    const placeholder = (element.placeholder || '').toLowerCase();
    for (const [pattern, type] of Object.entries(namePatterns)) {
      if (placeholder.includes(pattern)) {
        return type;
      }
    }
  }

  return 'text'; // Default
}

/**
 * Get label text for an input field
 */
export function getFieldLabel(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) {
        return label.textContent || '';
      }
    }

    // Check for parent label
    let parent = element.parentElement;
    while (parent) {
      if (parent.tagName === 'LABEL') {
        return parent.textContent || '';
      }
      parent = parent.parentElement;
    }

    // Check aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel;
    }
  }

  return '';
}

/**
 * Analyze field context from element
 */
export function analyzeFieldContext(element: HTMLElement): FieldContext {
  const fieldType = detectFieldType(element);
  const fieldName = (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
    ? (element.name || element.id || '')
    : '';
  const placeholder = (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
    ? (element.placeholder || '')
    : '';
  const label = getFieldLabel(element);
  const domain = window.location.hostname;

  return {
    fieldType,
    fieldName,
    placeholder,
    label,
    domain,
  };
}

/**
 * Match macro to context based on field type and domain
 */
export function matchMacroToContext(
  macro: { fieldTypes?: string[]; domains?: string[]; contextUsage?: Record<string, number> },
  context: FieldContext
): number {
  let score = 0;

  // Field type match
  if (macro.fieldTypes?.includes(context.fieldType)) {
    score += 10;
  }

  // Domain match
  if (macro.domains?.some(domain => context.domain.includes(domain))) {
    score += 5;
  }

  // Usage-based scoring (learned preferences)
  const contextKey = `${context.domain}:${context.fieldType}`;
  if (macro.contextUsage?.[contextKey]) {
    score += macro.contextUsage[contextKey] * 0.1; // Boost based on usage
  }

  return score;
}

/**
 * Fuzzy match text against macro name or content
 */
export function fuzzyMatch(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Exact match
  if (textLower === queryLower) {
    return 100;
  }

  // Starts with
  if (textLower.startsWith(queryLower)) {
    return 80;
  }

  // Contains
  if (textLower.includes(queryLower)) {
    return 60;
  }

  // Character-based fuzzy match
  let matches = 0;
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      matches++;
      queryIndex++;
    }
  }

  if (queryIndex === queryLower.length) {
    return 40 + (matches / queryLower.length) * 20;
  }

  return 0;
}

