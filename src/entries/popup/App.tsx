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

  useEffect(() => {
    loadMacros();
    loadTags();
    loadSettings();
  }, []);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        if (!isDialogOpen) handleOpenDialog();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (isDialogOpen) handleCloseDialog();
        if (showImportModal) setShowImportModal(false);
        if (deleteConfirmId) setDeleteConfirmId(null);
        return;
      }
      if (isDialogOpen || showImportModal || deleteConfirmId) return;
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
      if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < filteredMacros.length) {
        e.preventDefault();
        handleCopyMacro(filteredMacros[selectedIndex]);
        return;
      }
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

  const loadSettings = async () => {
    const result = await chrome.storage.sync.get('autocompleteEnabled');
    setAutocompleteEnabled(result.autocompleteEnabled !== false);
  };

  const saveSettings = async (enabled: boolean) => {
    await chrome.storage.sync.set({ autocompleteEnabled: enabled });
    setAutocompleteEnabled(enabled);
    showToast(enabled ? "Smart suggestions enabled" : "Smart suggestions disabled", "positive");
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

  return (
    <div className="app-container">
      {/* Header */}
      <div className="header">
        <div className="header-top">
          <h1 className="header-title">Macros</h1>
          <div className="header-actions">
            <button
              className="icon-btn"
              onClick={handleExport}
              title="Export macros"
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M8 2L8 10M8 10L5 7M8 10L11 7M3 10L3 13L13 13L13 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowImportModal(true)}
              title="Import macros"
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M8 6L8 14M8 14L5 11M8 14L11 11M3 6L3 3L13 3L13 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
            >
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                <path d="M8 4V2M8 14V12M12 8H14M2 8H4M11.314 4.686L12.728 3.272M3.272 12.728L4.686 11.314M11.314 11.314L12.728 12.728M3.272 3.272L4.686 4.686" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="search-wrapper">
          <svg className="search-icon" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="Search macros..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {allTags.length > 0 && (
          <div className="filters">
            {allTags.map((tag: string) => (
              <div
                key={tag}
                className={`filter-chip ${selectedTags.includes(tag) ? "active" : ""}`}
                onClick={() => handleTagFilter(tag)}
              >
                {tag}
                {selectedTags.includes(tag) && (
                  <button
                    className="filter-chip-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTagFilter(tag);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="controls">
        <select
          className="sort-select"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
        >
          <option value="alphabetical">A-Z</option>
          <option value="usage">Most Used</option>
          <option value="recent">Recent</option>
        </select>
        <button className="new-btn" onClick={() => handleOpenDialog()}>
          + New
        </button>
      </div>

      {/* Macro List */}
      <div className="macro-list-container" ref={listRef}>
        {filteredMacros.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 64 64" fill="none">
                <rect x="16" y="16" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
                <path d="M24 28L28 32L40 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="empty-state-title">
              {macros.length === 0 ? "No macros yet" : "No matches"}
            </div>
            <div className="empty-state-text">
              {macros.length === 0
                ? "Create your first macro to get started"
                : "Try adjusting your search or filters"}
            </div>
            {macros.length === 0 && (
              <button className="new-btn" onClick={() => handleOpenDialog()}>
                Create Macro
              </button>
            )}
          </div>
        ) : (
          <div className="macro-list">
            {filteredMacros.map((macro: Macro, index: number) => (
              <div
                key={macro.id}
                className={`macro-card ${selectedIndex === index ? "selected" : ""}`}
              >
                <div onClick={() => handleCopyMacro(macro)}>
                  <div className="macro-card-header">
                    <h3 className="macro-name">{macro.name}</h3>
                    {macro.usageCount !== undefined && macro.usageCount > 0 && (
                      <span className="macro-usage">{macro.usageCount}</span>
                    )}
                  </div>
                  <div className="macro-content">{macro.content}</div>
                  <div className="macro-footer">
                    {macro.tags.length > 0 && (
                      <div className="macro-tags">
                        {macro.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="macro-tag">{tag}</span>
                        ))}
                        {macro.tags.length > 2 && (
                          <span className="macro-tag">+{macro.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                    <div className="macro-actions">
                      <button
                        className="macro-action-btn edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDialog(macro);
                        }}
                        title="Edit"
                      >
                        <svg viewBox="0 0 16 16" fill="none">
                          <path d="M11.333 2.00001C11.5084 1.82464 11.7163 1.68576 11.9448 1.59197C12.1733 1.49818 12.4176 1.45142 12.6643 1.45468C12.911 1.45794 13.1541 1.51115 13.3795 1.61119C13.6049 1.71123 13.8078 1.8558 13.9762 2.03715C14.1446 2.2185 14.2747 2.43258 14.3589 2.66618C14.4431 2.89978 14.4794 3.14808 14.4654 3.39574C14.4514 3.6434 14.3874 3.88524 14.2777 4.10667C14.168 4.3281 14.0151 4.5245 13.828 4.68401L13.333 5.17901L10.828 2.67401L11.333 2.00001ZM9.885 3.44701L2.333 11H4.333V13H6.333V11H8.333L9.885 3.44701Z" fill="currentColor" />
                        </svg>
                      </button>
                      <button
                        className="macro-action-btn delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(macro.id);
                        }}
                        title="Delete"
                      >
                        <svg viewBox="0 0 16 16" fill="none">
                          <path d="M6.5 1.5C6.5 1.22386 6.72386 1 7 1H9C9.27614 1 9.5 1.22386 9.5 1.5V2.5H12.5C12.7761 2.5 13 2.72386 13 3C13 3.27614 12.7761 3.5 12.5 3.5H3.5C3.22386 3.5 3 3.27614 3 3C3 2.72386 3.22386 2.5 3.5 2.5H6.5V1.5ZM4.5 4.5H11.5L11.1464 12.8536C11.1133 13.4079 10.6579 13.85 10.1036 13.85H5.89645C5.34207 13.85 4.88672 13.4079 4.85355 12.8536L4.5 4.5Z" fill="currentColor" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast.open && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Modals - Using simple overlays */}
      {isDialogOpen && (
        <div className="modal-overlay" onClick={handleCloseDialog}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{editingMacro ? "Edit Macro" : "New Macro"}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input
                type="text"
                placeholder="Macro Name"
                value={macroName}
                onChange={(e) => setMacroName(e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "15px" }}
                autoFocus
              />
              <textarea
                placeholder="Content..."
                value={macroContent}
                onChange={(e) => setMacroContent(e.target.value)}
                rows={6}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "15px", fontFamily: "monospace", resize: "vertical" }}
              />
              <div>
                <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px" }}>Variables:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {AVAILABLE_VARIABLES.map((v) => (
                    <span key={v.variable} style={{ fontSize: "10px", padding: "4px 8px", background: "var(--background)", borderRadius: "4px", fontFamily: "monospace" }} title={v.description}>
                      {v.variable}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "14px", marginBottom: "8px" }}>Tags</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                  {macroTags.map((tag) => (
                    <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", background: "var(--accent)", color: "white", borderRadius: "16px", fontSize: "12px" }}>
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Add tag"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "14px" }}
                  />
                  <button onClick={handleAddTag} style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                    Add
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                <button onClick={handleCloseDialog} style={{ padding: "8px 16px", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleSaveMacro} disabled={!macroName.trim() || !macroContent.trim()} style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", opacity: (!macroName.trim() || !macroContent.trim()) ? 0.5 : 1 }}>
                  {editingMacro ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={() => { setShowImportModal(false); setImportText(""); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Import Macros</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input type="file" accept=".json" onChange={handleImportFile} style={{ fontSize: "14px" }} />
              <textarea
                placeholder="Paste JSON here..."
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
                style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "14px", fontFamily: "monospace" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                <input type="checkbox" checked={importMerge} onChange={(e) => setImportMerge(e.target.checked)} />
                Merge with existing macros
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button onClick={() => { setShowImportModal(false); setImportText(""); }} style={{ padding: "8px 16px", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleImport} disabled={!importText.trim()} style={{ padding: "8px 16px", background: "var(--accent)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", opacity: !importText.trim() ? 0.5 : 1 }}>
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Delete Macro</h2>
            <p>Are you sure you want to delete this macro?</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button onClick={() => setDeleteConfirmId(null)} style={{ padding: "8px 16px", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => deleteConfirmId && handleDeleteMacro(deleteConfirmId)} style={{ padding: "8px 16px", background: "var(--danger)", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Settings</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: "500", marginBottom: "4px" }}>Auto-suggest & Tab Completion</div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Show macro suggestions as you type</div>
                </div>
                <input type="checkbox" checked={autocompleteEnabled} onChange={(e) => saveSettings(e.target.checked)} style={{ width: "20px", height: "20px", cursor: "pointer" }} />
              </div>
              <div style={{ marginTop: "8px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "8px" }}>Features:</div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                  • Type macro name and press Tab to expand<br />
                  • See suggestions in a floating overlay<br />
                  • Context-aware suggestions based on field type<br />
                  • Keyboard navigation (Arrow keys, Enter, Esc)
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                <button onClick={() => setShowSettingsModal(false)} style={{ padding: "8px 16px", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
