import {
  Button,
  Chips,
  Divider,
  Dropdown,
  Flex,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  Modal,
  ModalContent,
  ModalHeader,
  Search,
  Text,
  TextArea,
  TextField,
  Toast
} from "@vibe/core";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Macro } from "../../types/macro";
import {
  createMacro,
  deleteMacro,
  exportMacros,
  getAllMacros,
  getAllTags,
  importMacros,
  incrementMacroUsage,
  saveMacro,
} from "../../utils/storage";
import { AVAILABLE_VARIABLES, processMacroVariables } from "../../utils/variables";
import "./App.css";

type SortOrder = "usage" | "recent" | "alphabetical";

interface ToastState {
  open: boolean;
  message: string;
  type: "positive" | "negative" | "normal";
}

function App() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>("alphabetical");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [macroName, setMacroName] = useState("");
  const [macroContent, setMacroContent] = useState("");
  const [macroTags, setMacroTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ open: false, message: "", type: "normal" });
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMerge, setImportMerge] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((message: string, type: "positive" | "negative" | "normal" = "normal") => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast({ open: false, message: "", type: "normal" }), 3000);
  }, []);

  // Load macros on mount
  useEffect(() => {
    loadMacros();
    loadTags();
    loadSettings();
  }, []);

  // Load settings
  const loadSettings = async () => {
    const result = await chrome.storage.sync.get('autocompleteEnabled');
    setAutocompleteEnabled(result.autocompleteEnabled !== false); // Default to true
  };

  // Save settings
  const saveSettings = async (enabled: boolean) => {
    await chrome.storage.sync.set({ autocompleteEnabled: enabled });
    setAutocompleteEnabled(enabled);
    // Content scripts will automatically pick up the storage change
    showToast(enabled ? "Smart suggestions enabled" : "Smart suggestions disabled", "positive");
  };

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = () => {
      loadMacros();
      loadTags();
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Filter and sort macros
  const filteredMacros = useMemo(() => {
    let filtered = macros.filter((macro) => {
      const matchesSearch =
        searchQuery === "" ||
        macro.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        macro.content.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((tag) => macro.tags.includes(tag));

      return matchesSearch && matchesTags;
    });

    // Sort macros
    filtered = [...filtered].sort((a, b) => {
      if (sortOrder === "usage") {
        const aCount = a.usageCount || 0;
        const bCount = b.usageCount || 0;
        return bCount - aCount;
      } else if (sortOrder === "recent") {
        const aLast = a.lastUsed || a.createdAt;
        const bLast = b.lastUsed || b.createdAt;
        return bLast - aLast;
      } else {
        return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [macros, searchQuery, selectedTags, sortOrder]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+N: New macro
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        if (!isDialogOpen) handleOpenDialog();
        return;
      }

      // Ctrl/Cmd+F: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Escape: Close modals
      if (e.key === "Escape") {
        if (isDialogOpen) handleCloseDialog();
        if (showImportModal) setShowImportModal(false);
        if (deleteConfirmId) setDeleteConfirmId(null);
        return;
      }

      // Only handle navigation if no modal is open
      if (isDialogOpen || showImportModal || deleteConfirmId) return;

      // Arrow keys: Navigate list
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredMacros.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
        return;
      }

      // Enter: Insert selected macro
      if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < filteredMacros.length) {
        e.preventDefault();
        handleQuickInsert(filteredMacros[selectedIndex]);
        return;
      }

      // Delete: Delete selected macro
      if (e.key === "Delete" && selectedIndex >= 0 && selectedIndex < filteredMacros.length) {
        e.preventDefault();
        setDeleteConfirmId(filteredMacros[selectedIndex].id);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredMacros, selectedIndex, isDialogOpen, showImportModal, deleteConfirmId]);

  const loadMacros = async () => {
    const loadedMacros = await getAllMacros();
    setMacros(loadedMacros);
  };

  const loadTags = async () => {
    const tags = await getAllTags();
    setAllTags(tags);
  };

  const handleOpenDialog = (macro?: Macro) => {
    if (macro) {
      setEditingMacro(macro);
      setMacroName(macro.name);
      setMacroContent(macro.content);
      setMacroTags([...macro.tags]);
    } else {
      setEditingMacro(null);
      setMacroName("");
      setMacroContent("");
      setMacroTags([]);
    }
    setIsDialogOpen(true);
    setSelectedIndex(-1);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingMacro(null);
    setMacroName("");
    setMacroContent("");
    setMacroTags([]);
    setNewTag("");
  };

  const handleSaveMacro = async () => {
    if (!macroName.trim() || !macroContent.trim()) {
      return;
    }

    const macroToSave = editingMacro
      ? {
        ...editingMacro,
        name: macroName.trim(),
        content: macroContent.trim(),
        tags: macroTags,
        updatedAt: Date.now(),
      }
      : createMacro(macroName.trim(), macroContent.trim(), macroTags);

    await saveMacro(macroToSave);
    showToast(editingMacro ? "Macro updated successfully" : "Macro created successfully", "positive");
    handleCloseDialog();
  };

  const handleDeleteMacro = async (id: string) => {
    await deleteMacro(id);
    showToast("Macro deleted successfully", "positive");
    setDeleteConfirmId(null);
    setSelectedIndex(-1);
  };

  const handleDuplicateMacro = async (macro: Macro) => {
    const duplicated = createMacro(
      `Copy of ${macro.name}`,
      macro.content,
      [...macro.tags]
    );
    await saveMacro(duplicated);
    showToast("Macro duplicated successfully", "positive");
  };

  const handleQuickInsert = async (macro: Macro) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        showToast("No active tab found", "negative");
        return;
      }

      const processedContent = await processMacroVariables(macro.content);

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (text: string) => {
          const activeElement = document.activeElement as HTMLElement;
          if (!activeElement) return;

          if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
            const start = activeElement.selectionStart || 0;
            const end = activeElement.selectionEnd || 0;
            activeElement.value = activeElement.value.substring(0, start) + text + activeElement.value.substring(end);
            activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
            activeElement.dispatchEvent(new Event("input", { bubbles: true }));
            activeElement.dispatchEvent(new Event("change", { bubbles: true }));
            activeElement.focus();
          } else if (activeElement.isContentEditable) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              range.deleteContents();
              range.insertNode(document.createTextNode(text));
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            } else {
              activeElement.textContent = (activeElement.textContent || "") + text;
            }
            activeElement.dispatchEvent(new Event("input", { bubbles: true }));
          }
        },
        args: [processedContent],
      });

      await incrementMacroUsage(macro.id);
      showToast(`Macro "${macro.name}" inserted`, "positive");
    } catch (error) {
      console.error("Error inserting macro:", error);
      showToast("Failed to insert macro", "negative");
    }
  };

  const handleCopyMacro = async (macro: Macro) => {
    try {
      const processedContent = await processMacroVariables(macro.content);

      await navigator.clipboard.writeText(processedContent);

      await incrementMacroUsage(macro.id);
      showToast(`Macro "${macro.name}" copied to clipboard`, "positive");
    } catch (error) {
      console.error("Error copying macro:", error);
      showToast("Failed to copy macro to clipboard", "negative");
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportMacros();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `macros-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Macros exported successfully", "positive");
    } catch (error) {
      console.error("Error exporting macros:", error);
      showToast("Failed to export macros", "negative");
    }
  };

  const handleImport = async () => {
    try {
      const count = await importMacros(importText, importMerge);
      showToast(`Imported ${count} macro(s) successfully`, "positive");
      setShowImportModal(false);
      setImportText("");
      await loadMacros();
    } catch (error) {
      console.error("Error importing macros:", error);
      showToast("Failed to import macros. Check the JSON format.", "negative");
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setImportText(text);
      };
      reader.readAsText(file);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !macroTags.includes(newTag.trim())) {
      setMacroTags([...macroTags, newTag.trim()]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setMacroTags(macroTags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagFilter = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const EmptyState = () => (
    <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.MEDIUM} align={Flex.align.CENTER} style={{ padding: "20px", textAlign: "center" }}>
      <Text type={Text.types.TEXT1} style={{ fontSize: "16px", fontWeight: "bold" }}>
        {macros.length === 0 ? "Welcome to Macro Manager!" : "No macros match your search"}
      </Text>
      <Text type={Text.types.TEXT2} color={Text.colors.SECONDARY}>
        {macros.length === 0
          ? "Create your first macro to get started. Macros can contain text, code, or use variables like {{date}} and {{time}}."
          : "Try adjusting your search or filters"}
      </Text>
      {macros.length === 0 && (
        <Button onClick={() => handleOpenDialog()} kind={Button.kinds.PRIMARY} size={Button.sizes.SMALL}>
          Create Your First Macro
        </Button>
      )}
      <Divider />
      <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.XS} align={Flex.align.START} style={{ fontSize: "12px", textAlign: "left" }}>
        <Text type={Text.types.TEXT2} style={{ fontWeight: "bold" }}>Keyboard Shortcuts:</Text>
        <Text type={Text.types.TEXT2}>• Ctrl/Cmd+N: New macro</Text>
        <Text type={Text.types.TEXT2}>• Ctrl/Cmd+F: Focus search</Text>
        <Text type={Text.types.TEXT2}>• Arrow keys: Navigate</Text>
        <Text type={Text.types.TEXT2}>• Enter: Insert macro</Text>
        <Text type={Text.types.TEXT2}>• Delete: Remove macro</Text>
      </Flex>
    </Flex>
  );

  return (
    <div className="app-container">
      <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL} className="app-content">
        {/* Header Section - Minimal */}
        <Flex justify={Flex.justify.SPACE_BETWEEN} align={Flex.align.CENTER} className="header-section">
          <Search
            ref={searchInputRef}
            placeholder="Search macros..."
            value={searchQuery}
            onChange={(value: string) => setSearchQuery(value)}
            size="medium"
            className="search-input"
          />
          <MenuButton
            component={() => <IconButton icon="MoreVertical" ariaLabel="More options" size={IconButton.sizes.SMALL} kind={IconButton.kinds.TERTIARY} />}
            ariaLabel="More options"
            size={MenuButton.sizes.SMALL}
          >
            <Menu id="header-menu">
              <MenuItem title="Export macros" onClick={handleExport} />
              <MenuItem title="Import macros" onClick={() => setShowImportModal(true)} />
              <MenuItem title="Settings" onClick={() => setShowSettingsModal(true)} />
            </Menu>
          </MenuButton>
        </Flex>

        {/* Filters & Tags - Collapsible or Minimal */}
        <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.XS}>
          <Flex justify={Flex.justify.SPACE_BETWEEN} align={Flex.align.CENTER}>
            <Flex gap={Flex.gaps.XS} align={Flex.align.CENTER} className="sort-section">
              <Dropdown
                size={Dropdown.sizes.SMALL}
                placeholder="Sort"
                value={{ label: sortOrder === "usage" ? "Most Used" : sortOrder === "recent" ? "Recent" : "A-Z", value: sortOrder }}
                options={[
                  { label: "Most Used", value: "usage" },
                  { label: "Recently Used", value: "recent" },
                  { label: "Alphabetical", value: "alphabetical" },
                ]}
                onChange={(option: any) => option && setSortOrder(option.value as SortOrder)}
                className="sort-dropdown"
              />
            </Flex>
            <Button
              onClick={() => handleOpenDialog()}
              kind={Button.kinds.PRIMARY}
              size={Button.sizes.SMALL}
              ariaLabel="New macro (Ctrl+N)"
            >
              + New
            </Button>
          </Flex>

          {allTags.length > 0 && (
            <Flex gap={Flex.gaps.XS} wrap className="tags-section">
              {allTags.map((tag: string) => (
                <div key={tag} style={{ cursor: "pointer" }}>
                  <Chips
                    label={tag}
                    color={selectedTags.includes(tag) ? Chips.colors.POSITIVE : Chips.colors.NEUTRAL}
                    onClick={() => handleTagFilter(tag)}
                    className="tag-chip"
                  />
                </div>
              ))}
            </Flex>
          )}
        </Flex>

        <div className="macro-list-container" ref={listRef}>
          {filteredMacros.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="macro-list">
              {filteredMacros.map((macro: Macro, index: number) => (
                <div
                  key={macro.id}
                  className={`macro-card ${selectedIndex === index ? "selected" : ""}`}
                >
                  <div className="macro-card-content" onClick={() => handleCopyMacro(macro)}>
                    <div className="macro-header">
                      <Text type={Text.types.TEXT1} className="macro-name">
                        {macro.name}
                      </Text>
                      {macro.usageCount !== undefined && macro.usageCount > 0 && (
                        <span className="macro-usage">{macro.usageCount} uses</span>
                      )}
                    </div>

                    <Text type={Text.types.TEXT2} className="macro-content-preview">
                      {macro.content}
                    </Text>

                    {macro.tags.length > 0 && (
                      <Flex gap={Flex.gaps.XS} wrap className="macro-tags">
                        {macro.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="mini-tag">{tag}</span>
                        ))}
                        {macro.tags.length > 3 && <span className="mini-tag">+{macro.tags.length - 3}</span>}
                      </Flex>
                    )}
                  </div>

                  <div className="macro-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="action-button edit-button"
                      onClick={() => handleOpenDialog(macro)}
                      aria-label="Edit macro"
                      title="Edit macro"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.333 2.00001C11.5084 1.82464 11.7163 1.68576 11.9448 1.59197C12.1733 1.49818 12.4176 1.45142 12.6643 1.45468C12.911 1.45794 13.1541 1.51115 13.3795 1.61119C13.6049 1.71123 13.8078 1.8558 13.9762 2.03715C14.1446 2.2185 14.2747 2.43258 14.3589 2.66618C14.4431 2.89978 14.4794 3.14808 14.4654 3.39574C14.4514 3.6434 14.3874 3.88524 14.2777 4.10667C14.168 4.3281 14.0151 4.5245 13.828 4.68401L13.333 5.17901L10.828 2.67401L11.333 2.00001ZM9.885 3.44701L2.333 11H4.333V13H6.333V11H8.333L9.885 3.44701Z" fill="currentColor" />
                      </svg>
                    </button>
                    <button
                      className="action-button delete-button"
                      onClick={() => setDeleteConfirmId(macro.id)}
                      aria-label="Delete macro"
                      title="Delete macro"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6.5 1.5C6.5 1.22386 6.72386 1 7 1H9C9.27614 1 9.5 1.22386 9.5 1.5V2.5H12.5C12.7761 2.5 13 2.72386 13 3C13 3.27614 12.7761 3.5 12.5 3.5H3.5C3.22386 3.5 3 3.27614 3 3C3 2.72386 3.22386 2.5 3.5 2.5H6.5V1.5ZM4.5 4.5H11.5L11.1464 12.8536C11.1133 13.4079 10.6579 13.85 10.1036 13.85H5.89645C5.34207 13.85 4.88672 13.4079 4.85355 12.8536L4.5 4.5Z" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Flex>

      {/* Toast Notification */}
      <Toast
        open={toast.open}
        onClose={() => setToast({ open: false, message: "", type: "normal" })}
        type={toast.type}
        autoHideDuration={3000}
      >
        {toast.message}
      </Toast>

      {/* Add/Edit Modal */}
      <Modal
        id="macro-edit-modal"
        show={isDialogOpen}
        onClose={handleCloseDialog}
        width="default"
      >
        <ModalHeader title={editingMacro ? "Edit Macro" : "New Macro"} />
        <ModalContent>
          <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.MEDIUM}>
            <TextField
              placeholder="Macro Name"
              value={macroName}
              onChange={(value: string) => setMacroName(value)}
              size={TextField.sizes.MEDIUM}
              autoFocus
            />
            <TextArea
              placeholder="Content..."
              value={macroContent}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMacroContent(e.target.value)}
              rows={6}
            />
            <div className="variables-hint">
              <Text type={Text.types.TEXT2} style={{ fontSize: "11px", fontWeight: "600", marginBottom: "4px" }}>
                Variables:
              </Text>
              <div className="variables-list">
                {AVAILABLE_VARIABLES.map((v) => (
                  <span key={v.variable} className="variable-chip" title={v.description}>
                    {v.variable}
                  </span>
                ))}
              </div>
            </div>

            <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL}>
              <Text type={Text.types.TEXT2}>Tags</Text>
              <Flex gap={Flex.gaps.XS} wrap>
                {macroTags.map((tag) => (
                  <Chips
                    key={tag}
                    label={tag}
                    onDelete={() => handleRemoveTag(tag)}
                  />
                ))}
              </Flex>
              <Flex gap={Flex.gaps.XS}>
                <TextField
                  placeholder="Add tag"
                  value={newTag}
                  onChange={(value: string) => setNewTag(value)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  size={TextField.sizes.SMALL}
                />
                <Button
                  onClick={handleAddTag}
                  kind={Button.kinds.SECONDARY}
                  size={Button.sizes.SMALL}
                >
                  Add
                </Button>
              </Flex>
            </Flex>
            <Flex justify={Flex.justify.END} gap={Flex.gaps.SMALL} style={{ marginTop: "16px" }}>
              <Button onClick={handleCloseDialog} kind={Button.kinds.TERTIARY}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveMacro}
                kind={Button.kinds.PRIMARY}
                disabled={!macroName.trim() || !macroContent.trim()}
              >
                {editingMacro ? "Save Changes" : "Create Macro"}
              </Button>
            </Flex>
          </Flex>
        </ModalContent>
      </Modal>

      {/* Import Modal */}
      <Modal
        id="import-modal"
        show={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportText("");
        }}
        width="default"
      >
        <ModalHeader title="Import Macros" />
        <ModalContent>
          <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.MEDIUM}>
            <Text type={Text.types.TEXT2}>
              Paste JSON or select a file to import macros.
            </Text>
            <input
              type="file"
              accept=".json"
              onChange={handleImportFile}
              style={{ fontSize: "12px" }}
            />
            <TextArea
              placeholder="Paste JSON here..."
              value={importText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setImportText(e.target.value)}
              rows={6}
            />
            <Flex align={Flex.align.CENTER} gap={Flex.gaps.SMALL}>
              <input
                type="checkbox"
                checked={importMerge}
                onChange={(e) => setImportMerge(e.target.checked)}
                id="import-merge"
              />
              <label htmlFor="import-merge" style={{ fontSize: "12px" }}>
                Merge with existing macros
              </label>
            </Flex>
            <Flex justify={Flex.justify.END} gap={Flex.gaps.SMALL}>
              <Button
                onClick={() => {
                  setShowImportModal(false);
                  setImportText("");
                }}
                kind={Button.kinds.TERTIARY}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                kind={Button.kinds.PRIMARY}
                disabled={!importText.trim()}
              >
                Import
              </Button>
            </Flex>
          </Flex>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        id="delete-confirm-modal"
        show={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        width="default"
      >
        <ModalHeader title="Delete Macro" />
        <ModalContent>
          <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.MEDIUM}>
            <Text type={Text.types.TEXT1}>
              Are you sure you want to delete this macro?
            </Text>
            <Flex justify={Flex.justify.END} gap={Flex.gaps.SMALL}>
              <Button
                onClick={() => setDeleteConfirmId(null)}
                kind={Button.kinds.TERTIARY}
              >
                Cancel
              </Button>
              <Button
                onClick={() => deleteConfirmId && handleDeleteMacro(deleteConfirmId)}
                kind={Button.kinds.PRIMARY}
                color={Button.colors.NEGATIVE}
              >
                Delete
              </Button>
            </Flex>
          </Flex>
        </ModalContent>
      </Modal>

      {/* Settings Modal */}
      <Modal
        id="settings-modal"
        show={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        width="default"
      >
        <ModalHeader title="Settings" />
        <ModalContent>
          <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.MEDIUM}>
            <Text type={Text.types.TEXT1} style={{ fontWeight: "600" }}>
              Smart Features
            </Text>
            <Flex align={Flex.align.CENTER} gap={Flex.gaps.SMALL} justify={Flex.justify.SPACE_BETWEEN}>
              <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.XS} style={{ flex: 1 }}>
                <Text type={Text.types.TEXT1} style={{ fontWeight: "500" }}>
                  Auto-suggest & Tab Completion
                </Text>
                <Text type={Text.types.TEXT2} color={Text.colors.SECONDARY}>
                  Show macro suggestions as you type and enable Tab completion
                </Text>
              </Flex>
              <input
                type="checkbox"
                checked={autocompleteEnabled}
                onChange={(e) => saveSettings(e.target.checked)}
                style={{ width: "20px", height: "20px", cursor: "pointer" }}
              />
            </Flex>
            <Divider />
            <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.XS}>
              <Text type={Text.types.TEXT2} style={{ fontSize: "12px", color: Text.colors.SECONDARY }}>
                <strong>Features:</strong>
              </Text>
              <Text type={Text.types.TEXT2} style={{ fontSize: "11px", color: Text.colors.SECONDARY }}>
                • Type macro name and press Tab to expand
              </Text>
              <Text type={Text.types.TEXT2} style={{ fontSize: "11px", color: Text.colors.SECONDARY }}>
                • See suggestions in a floating overlay
              </Text>
              <Text type={Text.types.TEXT2} style={{ fontSize: "11px", color: Text.colors.SECONDARY }}>
                • Context-aware suggestions based on field type
              </Text>
              <Text type={Text.types.TEXT2} style={{ fontSize: "11px", color: Text.colors.SECONDARY }}>
                • Keyboard navigation (Arrow keys, Enter, Esc)
              </Text>
            </Flex>
            <Flex justify={Flex.justify.END} gap={Flex.gaps.SMALL} style={{ marginTop: "16px" }}>
              <Button
                onClick={() => setShowSettingsModal(false)}
                kind={Button.kinds.TERTIARY}
              >
                Close
              </Button>
            </Flex>
          </Flex>
        </ModalContent>
      </Modal>
    </div>
  );
}

export default App;
