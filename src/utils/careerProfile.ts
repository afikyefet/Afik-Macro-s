export interface CareerProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedin: string;
  website: string;
  resumeFileName: string;
}

export const CAREER_PROFILE_KEY = "careerProfile";
export const CAREER_AUTOFILL_ENABLED_KEY = "careerAutofillEnabled";

export const DEFAULT_CAREER_PROFILE: CareerProfile = {
  firstName: "Afik",
  lastName: "Yefet",
  email: "afik.yefet@gmail.com",
  phone: "+972525530451",
  linkedin: "https://www.linkedin.com/in/afik-yefet-906757326/",
  website: "https://afikyefet.com",
  resumeFileName: "Afik_Yefet_Resume_2026.docx",
};

export async function getCareerProfile(): Promise<CareerProfile> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CAREER_PROFILE_KEY, (result) => {
      const stored = result[CAREER_PROFILE_KEY] as Partial<CareerProfile> | undefined;
      resolve({ ...DEFAULT_CAREER_PROFILE, ...(stored ?? {}) });
    });
  });
}

export async function saveCareerProfile(profile: CareerProfile): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [CAREER_PROFILE_KEY]: profile }, () => {
      resolve();
    });
  });
}

export async function getCareerAutofillEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CAREER_AUTOFILL_ENABLED_KEY, (result) => {
      resolve(result[CAREER_AUTOFILL_ENABLED_KEY] !== false);
    });
  });
}

export async function setCareerAutofillEnabled(enabled: boolean): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [CAREER_AUTOFILL_ENABLED_KEY]: enabled }, () => {
      resolve();
    });
  });
}
