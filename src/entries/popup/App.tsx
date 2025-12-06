import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  TextField,
  TextArea,
  Search,
  List,
  ListItem,
  Chips,
  Modal,
  ModalHeader,
  ModalContent,
  Heading,
  Text,
  Flex,
  Divider,
} from "@vibe/core";
import { getAllMacros, saveMacro, deleteMacro, createMacro, getAllTags } from "../../utils/storage";
import type { Macro } from "../../types/macro";
import "./App.css";

function App() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [macroName, setMacroName] = useState("");
  const [macroContent, setMacroContent] = useState("");
  const [macroTags, setMacroTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load macros on mount
  useEffect(() => {
    loadMacros();
    loadTags();
  }, []);

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

  const loadMacros = async () => {
    const loadedMacros = await getAllMacros();
    setMacros(loadedMacros);
  };

  const loadTags = async () => {
    const tags = await getAllTags();
    setAllTags(tags);
  };

  // Filter macros based on search and tags
  const filteredMacros = useMemo(() => {
    return macros.filter((macro) => {
      const matchesSearch =
        searchQuery === "" ||
        macro.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        macro.content.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((tag) => macro.tags.includes(tag));

      return matchesSearch && matchesTags;
    });
  }, [macros, searchQuery, selectedTags]);

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
    handleCloseDialog();
  };

  const handleDeleteMacro = async (id: string) => {
    await deleteMacro(id);
    setDeleteConfirmId(null);
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
      <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.SMALL} className="app-content">
        <Heading type={Heading.types.H2} value="Macro Manager" />
        
        <Flex gap={Flex.gaps.XS} align={Flex.align.CENTER}>
          <Search
            placeholder="Search macros..."
            value={searchQuery}
            onChange={(value: string) => setSearchQuery(value)}
            size="small"
            className="search-input"
          />
          <Button
            onClick={() => handleOpenDialog()}
            kind={Button.kinds.PRIMARY}
            size={Button.sizes.XXS}
          >
            + New
          </Button>
        </Flex>

        {allTags.length > 0 && (
          <Flex gap={Flex.gaps.XS} wrap style={{ maxHeight: "60px", overflowY: "auto" }}>
            {allTags.map((tag) => (
              <Chips
                key={tag}
                label={tag}
                color={selectedTags.includes(tag) ? Chips.colors.POSITIVE : Chips.colors.NEUTRAL}
                onClick={() => handleTagFilter(tag)}
                style={{ cursor: "pointer" }}
              />
            ))}
          </Flex>
        )}

        <Divider />

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

        {filteredMacros.length === 0 ? (
          <Text type={Text.types.TEXT2} color={Text.colors.SECONDARY}>
            {macros.length === 0
              ? "No macros yet. Create your first macro!"
              : "No macros match your search or filters."}
          </Text>
        ) : (
          <List>
            {filteredMacros.map((macro) => (
              <ListItem
                key={macro.id}
                className="macro-item"
              >
                <Flex
                  direction={Flex.directions.COLUMN}
                  gap={Flex.gaps.XS}
                  style={{ width: "100%" }}
                >
                  <Flex justify={Flex.justify.SPACE_BETWEEN} align={Flex.align.CENTER}>
                    <Heading type={Heading.types.H4} value={macro.name} style={{ margin: 0, fontSize: "14px" }} />
                    <Flex gap={Flex.gaps.XS}>
                      <Button
                        onClick={() => handleOpenDialog(macro)}
                        kind={Button.kinds.TERTIARY}
                        size={Button.sizes.XXS}
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => setDeleteConfirmId(macro.id)}
                        kind={Button.kinds.TERTIARY}
                        size={Button.sizes.XXS}
                        color={Button.colors.NEGATIVE}
                      >
                        Delete
                      </Button>
                    </Flex>
                  </Flex>
                  <Text type={Text.types.TEXT2} color={Text.colors.SECONDARY} style={{ fontSize: "12px" }}>
                    {macro.content.length > 60
                      ? `${macro.content.substring(0, 60)}...`
                      : macro.content}
                  </Text>
                  {macro.tags.length > 0 && (
                    <Flex gap={Flex.gaps.XS} wrap>
                      {macro.tags.map((tag) => (
                        <Chips key={tag} label={tag} />
                      ))}
                    </Flex>
                  )}
                </Flex>
              </ListItem>
            ))}
          </List>
        )}
        </div>
      </Flex>

      {/* Add/Edit Modal */}
      <Modal
        id="macro-edit-modal"
        show={isDialogOpen}
        onClose={handleCloseDialog}
        size="small"
      >
        <ModalHeader title={editingMacro ? "Edit Macro" : "New Macro"} />
        <ModalContent>
        <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.MEDIUM}>
          <TextField
            placeholder="Macro name"
            value={macroName}
            onChange={(value: string) => setMacroName(value)}
            title="Name"
            required
          />
          <TextArea
            placeholder="Macro content"
            value={macroContent}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMacroContent(e.target.value)}
            label="Content"
            rows={8}
          />
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
          <Flex justify={Flex.justify.END} gap={Flex.gaps.SMALL}>
            <Button onClick={handleCloseDialog} kind={Button.kinds.TERTIARY}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveMacro}
              kind={Button.kinds.PRIMARY}
              disabled={!macroName.trim() || !macroContent.trim()}
            >
              {editingMacro ? "Update" : "Create"}
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
        size="small"
      >
        <ModalHeader title="Delete Macro" />
        <ModalContent>
        <Flex direction={Flex.directions.COLUMN} gap={Flex.gaps.MEDIUM}>
          <Text type={Text.types.TEXT1}>
            Are you sure you want to delete this macro? This action cannot be undone.
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
    </div>
  );
}

export default App;
