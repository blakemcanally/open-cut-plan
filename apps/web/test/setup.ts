import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
});
