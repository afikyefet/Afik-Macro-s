/**
 * Function to insert text at the cursor position in an active element
 * This function is called by the background script via chrome.scripting.executeScript
 */
export function insertTextAtCursor(text: string): void {
  const activeElement = document.activeElement as HTMLElement;
  
  if (!activeElement) {
    console.error('No active element found');
    return;
  }

  // Handle input and textarea elements
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    const start = activeElement.selectionStart || 0;
    const end = activeElement.selectionEnd || 0;
    const value = activeElement.value;
    
    activeElement.value = value.substring(0, start) + text + value.substring(end);
    activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
    
    // Trigger input event for React and other frameworks
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    activeElement.dispatchEvent(new Event('change', { bubbles: true }));
    
    activeElement.focus();
    return;
  }

  // Handle contenteditable elements
  if (activeElement.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // If no selection, append to the end
      activeElement.textContent = (activeElement.textContent || '') + text;
    } else {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      
      // Move cursor after inserted text
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    
    // Trigger input event
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  console.error('Active element is not editable');
}

// Make function available globally for chrome.scripting.executeScript
(window as any).insertTextAtCursor = insertTextAtCursor;

