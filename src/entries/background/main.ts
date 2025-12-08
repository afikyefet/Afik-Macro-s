import browser from "webextension-polyfill";
import { STORAGE_KEY } from "../../types/macro";
import { getAllMacros, incrementMacroUsage } from "../../utils/storage";
import { processMacroVariables } from "../../utils/variables";

const CONTEXT_MENU_PARENT_ID = "macro-manager-parent";

/**
 * Create or update the context menu with all macros
 */
async function updateContextMenu() {
  // Remove existing menu items
  try {
    await browser.contextMenus.removeAll();
  } catch (error) {
    console.error("Error removing context menu items:", error);
  }

  // Create parent menu item
  browser.contextMenus.create({
    id: CONTEXT_MENU_PARENT_ID,
    title: "Macros",
    contexts: ["editable"],
  });

  // Get all macros and create menu items
  const macros = await getAllMacros();

  macros.forEach((macro) => {
    browser.contextMenus.create({
      id: macro.id,
      title: macro.name,
      parentId: CONTEXT_MENU_PARENT_ID,
      contexts: ["editable"],
    });
  });
}

/**
 * Function to insert text at cursor (will be injected into page)
 */
function insertTextAtCursor(text: string): void {
  const activeElement = document.activeElement as HTMLElement;

  if (!activeElement) {
    console.error("No active element found");
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
    activeElement.dispatchEvent(new Event("input", { bubbles: true }));
    activeElement.dispatchEvent(new Event("change", { bubbles: true }));

    activeElement.focus();
    return;
  }

  // Handle contenteditable elements
  if (activeElement.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // If no selection, append to the end
      activeElement.textContent = (activeElement.textContent || "") + text;
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
    activeElement.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  console.error("Active element is not editable");
}

/**
 * Handle context menu clicks
 */
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) {
    console.error("No tab ID available");
    return;
  }

  // Check if clicked item is a macro (not the parent)
  if (info.menuItemId !== CONTEXT_MENU_PARENT_ID) {
    const macros = await getAllMacros();
    const macro = macros.find((m) => m.id === info.menuItemId);

    if (macro) {
      try {
        // Process variables in macro content
        const processedContent = await processMacroVariables(macro.content);

        // Inject and execute the insert function
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: insertTextAtCursor,
          args: [processedContent],
        });

        // Track usage
        await incrementMacroUsage(macro.id);
      } catch (error) {
        console.error("Error inserting macro:", error);
      }
    }
  }
});

/**
 * Initialize context menu on install
 */
browser.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
  updateContextMenu();
});

/**
 * Update context menu when storage changes
 */
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes[STORAGE_KEY]) {
    console.log("Macros changed, updating context menu");
    updateContextMenu();
  }
});

/**
 * Update context menu on startup (in case it was missed)
 */
browser.runtime.onStartup.addListener(() => {
  console.log("Extension started");
  updateContextMenu();
});

// Initial context menu creation
updateContextMenu();
