# Tab Autocompletion System Guide

## How It Works

The autocompletion system has two main features:

### 1. **Tab Completion** (Quick Expand)
- **What it does**: Type a macro name and press Tab to instantly expand it
- **How it works**:
  1. As you type in any input field, the system extracts the last word/phrase
  2. It matches your typed text against macro names using fuzzy matching
  3. If there's a good match (score ≥ 60), it's ready for Tab completion
  4. Press Tab → the typed text is replaced with the full macro content

### 2. **Auto-Suggest Overlay** (Visual Suggestions)
- **What it does**: Shows a floating popup with macro suggestions as you type
- **How it works**:
  1. Monitors your typing in input fields
  2. Analyzes context (field type, website domain)
  3. Shows up to 5 relevant macros in a floating overlay
  4. Navigate with Arrow keys, select with Enter, dismiss with Esc

## Testing Instructions

### Prerequisites
1. Make sure autocomplete is enabled:
   - Open the extension popup
   - Click Settings (gear icon)
   - Ensure "Auto-suggest & Tab Completion" is checked

2. Create some test macros:
   - Create a macro named "email" with content "afik.yefet@gmail.com"
   - Create a macro named "sig" with content "Best regards,\nAfik Yefet"
   - Create a macro named "linkedin" with content "https://www.linkedin.com/in/afik-yefet"

### Test Tab Completion

1. **Go to any website** (e.g., Gmail, GitHub, any form)
2. **Click in any text input field** (email, message, comment, etc.)
3. **Type a macro name** (e.g., type "sig" or "email")
4. **Press Tab** → The typed text should be replaced with the macro content!

**Example:**
- Type: `sig` → Press Tab → Expands to: `Best regards,\nAfik Yefet`

### Test Auto-Suggest Overlay

1. **Go to any website with input fields**
2. **Click in a text input field**
3. **Start typing** (e.g., type "lin" or "em")
4. **A floating overlay should appear** below the input field showing matching macros
5. **Use keyboard navigation**:
   - Arrow Up/Down: Navigate suggestions
   - Enter: Insert selected macro
   - Esc: Dismiss overlay
   - Tab: Complete if there's a good match

### Test Context-Aware Suggestions

1. **Go to Gmail** (or any email site)
2. **Click in the email input field**
3. **Start typing** (or just focus the field)
4. **Macros tagged for "email" context should appear** in suggestions

### Troubleshooting

**Tab completion not working?**
- Check if autocomplete is enabled in settings
- Make sure you typed at least 2 characters
- The macro name must match with score ≥ 60 (fuzzy match)
- Try typing the exact macro name or a close match

**Overlay not showing?**
- Make sure you're typing in an input field (not just clicking)
- Check browser console for errors (F12)
- Try refreshing the page
- Make sure the extension is loaded and active

**Not working on a specific site?**
- Some sites use custom input components that might not trigger events
- Try a simple HTML form first (like Google search)
- Check if the site blocks content scripts

## How Matching Works

### Fuzzy Matching Scores:
- **100**: Exact match
- **80**: Starts with query
- **60**: Contains query (minimum for Tab completion)
- **40-59**: Character-based fuzzy match (shown in overlay only)
- **0**: No match

### Context Matching:
- Field type match: +10 points
- Domain match: +5 points
- Usage history: +0.1 per usage in that context

## Keyboard Shortcuts

- **Tab**: Complete macro if there's a match
- **Arrow Up/Down**: Navigate suggestions
- **Enter**: Insert selected macro
- **Esc**: Dismiss overlay
- **Click outside**: Dismiss overlay

