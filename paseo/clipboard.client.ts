import { Clipboard } from "react-native";

// The plugin sandbox has no dedicated clipboard module; RN core Clipboard
// still works (deprecated). Returns false when the host lacks the native module.
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}
