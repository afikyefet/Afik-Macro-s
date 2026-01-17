import type { CareerProfile } from "../utils/careerProfile";
import {
  CAREER_AUTOFILL_ENABLED_KEY,
  CAREER_PROFILE_KEY,
  DEFAULT_CAREER_PROFILE,
  getCareerAutofillEnabled,
  getCareerProfile,
} from "../utils/careerProfile";
import { getFieldLabel } from "../utils/context";

type FieldKey =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "linkedin"
  | "website"
  | "resume"
  | "coverLetter"
  | "portfolio";

interface FieldMatcher {
  key: FieldKey;
  patterns: RegExp[];
}

const AUTOFILL_ATTR = "data-career-autofilled";
const FILE_HINT_ATTR = "data-career-autofill-file";
const MIN_CAREER_SCORE = 6;

const ATS_HOST_PATTERNS = [
  /greenhouse/i,
  /comeet/i,
  /lever/i,
  /workable/i,
  /smartrecruiters/i,
  /jobvite/i,
  /icims/i,
  /bamboohr/i,
  /ashby/i,
  /workday/i,
  /teamtailor/i,
  /personio/i,
  /recruitee/i,
];

const FILE_FIELD_MATCHERS: FieldMatcher[] = [
  { key: "resume", patterns: [/resume\b/i, /\bcv\b/i, /curriculum vitae/i] },
  { key: "coverLetter", patterns: [/cover letter/i, /coverletter/i] },
  { key: "portfolio", patterns: [/portfolio/i] },
];

const TEXT_FIELD_MATCHERS: FieldMatcher[] = [
  { key: "firstName", patterns: [/first name/i, /given name/i, /forename/i] },
  { key: "lastName", patterns: [/last name/i, /family name/i, /surname/i] },
  { key: "email", patterns: [/email/i, /e-mail/i] },
  { key: "phone", patterns: [/phone/i, /mobile/i, /cell/i, /\btel\b/i, /telephone/i] },
  { key: "linkedin", patterns: [/linkedin/i] },
  { key: "website", patterns: [/website/i, /personal site/i, /portfolio/i, /homepage/i, /\burl\b/i] },
];

const FULL_NAME_HINT = /\bfull name\b|\byour name\b|\bname\b/i;
const FULL_NAME_BLOCK = /\b(first|last|family|given|company|business|position|job|title)\b/i;

let autofillEnabled = true;
let profileCache: CareerProfile | null = null;
let observer: MutationObserver | null = null;
let pendingRun = false;

function normalizeText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function getAriaLabelledByText(element: HTMLElement): string {
  const ids = element.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
  const text = ids
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  return text;
}

function getElementDescriptor(element: HTMLElement): string {
  const parts: string[] = [];

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    if (element.name) parts.push(element.name);
    if (element.id) parts.push(element.id);
    if ("placeholder" in element && element.placeholder) parts.push(element.placeholder);
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) parts.push(ariaLabel);
    const labelledBy = getAriaLabelledByText(element);
    if (labelledBy) parts.push(labelledBy);
    const label = getFieldLabel(element);
    if (label) parts.push(label);
    const autocomplete = element.getAttribute("autocomplete");
    if (autocomplete) parts.push(autocomplete);
  }

  return normalizeText(parts.join(" "));
}

function isFileInput(element: HTMLElement): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type.toLowerCase() === "file";
}

function isEditableTextField(
  element: HTMLElement
): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    const blockedTypes = new Set([
      "hidden",
      "password",
      "checkbox",
      "radio",
      "submit",
      "button",
      "image",
      "reset",
      "file",
    ]);
    return !blockedTypes.has(type) && !element.readOnly && !element.disabled;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }

  return false;
}

function matchesPatterns(text: string, matchers: FieldMatcher[]): FieldKey | null {
  for (const matcher of matchers) {
    if (matcher.patterns.some((pattern) => pattern.test(text))) {
      return matcher.key;
    }
  }
  return null;
}

function matchAutocompleteKey(autocomplete: string): FieldKey | null {
  const value = autocomplete.toLowerCase();
  if (!value) return null;

  if (value.includes("given-name")) return "firstName";
  if (value.includes("family-name")) return "lastName";
  if (value.includes("email")) return "email";
  if (value.includes("tel")) return "phone";
  if (value.includes("url")) return "website";
  if (value === "name") return "fullName";

  return null;
}

function matchFieldKey(element: HTMLElement): FieldKey | null {
  const descriptor = getElementDescriptor(element);

  if (isFileInput(element)) {
    return matchesPatterns(descriptor, FILE_FIELD_MATCHERS);
  }

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (type === "email") return "email";
    if (type === "tel") return "phone";
  }

  const autocomplete = element.getAttribute("autocomplete") ?? "";
  const autocompleteKey = matchAutocompleteKey(autocomplete);
  const textKey = matchesPatterns(descriptor, TEXT_FIELD_MATCHERS);
  if (textKey) return textKey;
  if (autocompleteKey) return autocompleteKey;

  if (FULL_NAME_HINT.test(descriptor) && !FULL_NAME_BLOCK.test(descriptor)) {
    return "fullName";
  }

  return null;
}

function getCandidateContainers(): HTMLElement[] {
  const containers = new Set<HTMLElement>();
  document.querySelectorAll("form").forEach((form) => containers.add(form));
  document.querySelectorAll("[role=\"form\"]").forEach((form) => containers.add(form as HTMLElement));
  return Array.from(containers);
}

function getCandidateFields(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll("input, textarea, select")) as HTMLElement[];
}

function hasCareerIndicator(container: HTMLElement, matches: Set<FieldKey>): boolean {
  if (matches.has("resume") || matches.has("coverLetter") || matches.has("portfolio")) {
    return true;
  }

  const host = window.location.hostname.toLowerCase();
  const action = container instanceof HTMLFormElement ? container.action.toLowerCase() : "";
  if (ATS_HOST_PATTERNS.some((pattern) => pattern.test(host) || pattern.test(action))) {
    return true;
  }

  const idClass = normalizeText(`${container.id} ${container.className}`);
  if (/\b(apply|application|career|job)\b/.test(idClass)) {
    return true;
  }

  const textSample = normalizeText((container.textContent || "").slice(0, 2000));
  return /\b(apply|application|resume|cv|cover letter|portfolio)\b/.test(textSample);
}

function scoreCareerContainer(container: HTMLElement, matches: Set<FieldKey>): number {
  let score = 0;

  if (matches.has("firstName")) score += 2;
  if (matches.has("lastName")) score += 2;
  if (matches.has("email")) score += 2;
  if (matches.has("phone")) score += 1;
  if (matches.has("linkedin") || matches.has("website")) score += 1;
  if (matches.has("resume") || matches.has("coverLetter") || matches.has("portfolio")) score += 2;

  const identityCount = ["firstName", "lastName", "fullName", "email", "phone"].filter((key) =>
    matches.has(key as FieldKey)
  ).length;
  if (identityCount >= 3) score += 2;

  const host = window.location.hostname.toLowerCase();
  const action = container instanceof HTMLFormElement ? container.action.toLowerCase() : "";
  if (ATS_HOST_PATTERNS.some((pattern) => pattern.test(host) || pattern.test(action))) {
    score += 2;
  }

  const textSample = normalizeText((container.textContent || "").slice(0, 2000));
  if (/\b(apply|application)\b/.test(textSample)) {
    score += 1;
  }

  return score;
}

function getProfileValue(profile: CareerProfile, key: FieldKey): string {
  switch (key) {
    case "firstName":
      return profile.firstName;
    case "lastName":
      return profile.lastName;
    case "fullName":
      return `${profile.firstName} ${profile.lastName}`.trim();
    case "email":
      return profile.email;
    case "phone":
      return profile.phone;
    case "linkedin":
      return profile.linkedin;
    case "website":
      return profile.website;
    case "resume":
      return profile.resumeFileName;
    default:
      return "";
  }
}

function fillTextField(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): boolean {
  if (!value) return false;
  if (element.hasAttribute(AUTOFILL_ATTR)) return false;
  if (element.value.trim().length > 0) return false;

  element.value = value;
  element.setAttribute(AUTOFILL_ATTR, "true");
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function markFileField(element: HTMLInputElement, hint: string): boolean {
  if (element.hasAttribute(FILE_HINT_ATTR)) return false;
  element.setAttribute(FILE_HINT_ATTR, hint || "file");
  if (hint) {
    element.title = `Attach ${hint}`;
  }
  return true;
}

function autoFillCareerForms(profile: CareerProfile): void {
  const containers = getCandidateContainers();
  if (containers.length === 0) return;

  containers.forEach((container) => {
    const fields = getCandidateFields(container);
    if (fields.length === 0) return;

    const matches = new Set<FieldKey>();
    fields.forEach((field) => {
      const key = matchFieldKey(field);
      if (key) matches.add(key);
    });

    if (!hasCareerIndicator(container, matches)) return;
    if (scoreCareerContainer(container, matches) < MIN_CAREER_SCORE) return;

    fields.forEach((field) => {
      const key = matchFieldKey(field);
      if (!key) return;

      if (key === "resume" || key === "coverLetter" || key === "portfolio") {
        if (isFileInput(field)) {
          const hint = key === "resume" ? profile.resumeFileName : "";
          markFileField(field, hint);
        }
        return;
      }

      if (!isEditableTextField(field)) return;
      const value = getProfileValue(profile, key);
      fillTextField(field, value);
    });
  });
}

function scheduleAutofill(): void {
  if (!autofillEnabled || !profileCache) return;
  if (pendingRun) return;
  pendingRun = true;
  window.setTimeout(() => {
    pendingRun = false;
    if (!autofillEnabled || !profileCache) return;
    autoFillCareerForms(profileCache);
  }, 250);
}

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => scheduleAutofill());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function stopObserver(): void {
  if (!observer) return;
  observer.disconnect();
  observer = null;
}

async function refreshProfile(): Promise<void> {
  profileCache = await getCareerProfile();
}

export async function initializeCareerAutofill(): Promise<void> {
  autofillEnabled = await getCareerAutofillEnabled();
  await refreshProfile();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleAutofill(), { once: true });
  } else {
    scheduleAutofill();
  }

  if (autofillEnabled) {
    startObserver();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes[CAREER_AUTOFILL_ENABLED_KEY]) {
      autofillEnabled = changes[CAREER_AUTOFILL_ENABLED_KEY].newValue !== false;
      if (autofillEnabled) {
        startObserver();
        scheduleAutofill();
      } else {
        stopObserver();
      }
    }

    if (changes[CAREER_PROFILE_KEY]) {
      const nextProfile = changes[CAREER_PROFILE_KEY].newValue as Partial<CareerProfile> | undefined;
      profileCache = { ...DEFAULT_CAREER_PROFILE, ...(nextProfile ?? {}) };
      scheduleAutofill();
    }
  });
}
