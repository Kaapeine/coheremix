import { create } from "zustand";
import { api } from "../api/client";
import type { ComparisonOut } from "../types/payload";

const LS = "coheremix:library";

interface LibStore {
  items: ComparisonOut[];
  loading: boolean;
  load: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
}

export const useLibrary = create<LibStore>((set, get) => ({
  items: JSON.parse(localStorage.getItem(LS) ?? "[]"),
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const items = await api.list();
      localStorage.setItem(LS, JSON.stringify(items));
      set({ items });
    } finally {
      set({ loading: false });
    }
  },

  remove: async (id) => {
    await api.remove(id);
    set({ items: get().items.filter((c) => c.id !== id) });
    const all = JSON.parse(localStorage.getItem(LS) ?? "[]") as ComparisonOut[];
    localStorage.setItem(LS, JSON.stringify(all.filter((c) => c.id !== id)));
  },

  rename: async (id, name) => {
    await api.patch(id, { name });
    set({ items: get().items.map((c) => (c.id === id ? { ...c, name } : c)) });
  },
}));
