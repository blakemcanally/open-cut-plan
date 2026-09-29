export interface OpenedFile {
  name: string;
  text: string;
  handle?: FileSystemFileHandle;
}

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

/** The File System Access API is not in every browser, so its entry points are optional. */
interface PickerWindow {
  showOpenFilePicker?: (options: { types: PickerType[]; multiple: false }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: { types: PickerType[]; suggestedName: string }) => Promise<FileSystemFileHandle>;
}

const PROJECT_TYPE: PickerType = { description: "OpenCutPlan project", accept: { "application/json": [".json"] } };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Resolves to null when the user closes the file chooser. */
export function chooseFile(accept: string, doc: Document = document): Promise<File | null> {
  return new Promise((resolve) => {
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

export async function openProjectFile(win: Window & PickerWindow = window): Promise<OpenedFile | null> {
  if (win.showOpenFilePicker) {
    try {
      const [handle] = await win.showOpenFilePicker({ types: [PROJECT_TYPE], multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  const file = await chooseFile(".json,.cutplan.json,application/json", win.document);
  return file ? { name: file.name, text: await file.text() } : null;
}

export function downloadText(text: string, name: string, type: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = doc.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Writes to `handle` when given; otherwise asks for a place to save (or downloads when the browser cannot ask).
 * Returns the handle to reuse for the next save, or null when the user cancelled.
 */
export async function saveProjectFile(
  text: string,
  suggestedName: string,
  handle: FileSystemFileHandle | undefined,
  win: Window & PickerWindow = window,
): Promise<FileSystemFileHandle | undefined | null> {
  try {
    const target = handle ?? (win.showSaveFilePicker ? await win.showSaveFilePicker({ types: [PROJECT_TYPE], suggestedName }) : undefined);
    if (!target) {
      downloadText(text, suggestedName, "application/json", win.document);
      return undefined;
    }
    const writable = await target.createWritable();
    await writable.write(text);
    await writable.close();
    return target;
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}
