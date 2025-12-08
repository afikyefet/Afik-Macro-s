/**
 * Process macro content and replace variables with actual values
 */
export async function processMacroVariables(content: string): Promise<string> {
  let processed = content;

  // Replace {{date}} with current date (YYYY-MM-DD)
  processed = processed.replace(/\{\{date\}\}/g, () => {
    const now = new Date();
    return now.toISOString().split("T")[0];
  });

  // Replace {{time}} with current time (HH:MM:SS)
  processed = processed.replace(/\{\{time\}\}/g, () => {
    const now = new Date();
    return now.toTimeString().split(" ")[0];
  });

  // Replace {{datetime}} with full date and time
  processed = processed.replace(/\{\{datetime\}\}/g, () => {
    const now = new Date();
    return now.toISOString().replace("T", " ").split(".")[0];
  });

  // Replace {{timestamp}} with Unix timestamp
  processed = processed.replace(/\{\{timestamp\}\}/g, () => {
    return Math.floor(Date.now() / 1000).toString();
  });

  // Replace {{clipboard}} with clipboard content
  if (processed.includes("{{clipboard}}")) {
    try {
      const clipboardText = await navigator.clipboard.readText();
      processed = processed.replace(/\{\{clipboard\}\}/g, clipboardText);
    } catch (error) {
      console.error("Error reading clipboard:", error);
      processed = processed.replace(/\{\{clipboard\}\}/g, "");
    }
  }

  return processed;
}

/**
 * Get list of available variables with descriptions
 */
export const AVAILABLE_VARIABLES = [
  { variable: "{{date}}", description: "Current date (YYYY-MM-DD)" },
  { variable: "{{time}}", description: "Current time (HH:MM:SS)" },
  { variable: "{{datetime}}", description: "Full date and time" },
  { variable: "{{timestamp}}", description: "Unix timestamp" },
  { variable: "{{clipboard}}", description: "Clipboard content" },
];

