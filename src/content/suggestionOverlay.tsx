import React, { useEffect, useRef } from 'react';
import type { Macro } from '../types/macro';
import './suggestionOverlay.css';

interface SuggestionOverlayProps {
  macros: Macro[];
  selectedIndex: number;
  query: string;
  position: { top: number; left: number };
  onSelect: (macro: Macro) => void;
  onClose: () => void;
}

export function SuggestionOverlay({
  macros,
  selectedIndex,
  query,
  position,
  onSelect,
  onClose,
}: SuggestionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Highlight matching text
  const highlightMatch = (text: string, query: string): React.ReactNode => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="match-highlight">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  if (macros.length === 0) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="macro-suggestion-overlay"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <div className="suggestion-header">
        <span className="suggestion-title">Macro Suggestions</span>
        <button className="close-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="suggestion-list">
        {macros.map((macro, index) => (
          <div
            key={macro.id}
            ref={index === selectedIndex ? selectedRef : null}
            className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => onSelect(macro)}
            onMouseEnter={() => {
              // Update selection on hover
            }}
          >
            <div className="suggestion-name">
              {highlightMatch(macro.name, query)}
            </div>
            <div className="suggestion-preview">
              {macro.content.length > 50
                ? `${macro.content.substring(0, 50)}...`
                : macro.content}
            </div>
            {macro.tags.length > 0 && (
              <div className="suggestion-tags">
                {macro.tags.slice(0, 2).map((tag) => (
                  <span key={tag} className="suggestion-tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

