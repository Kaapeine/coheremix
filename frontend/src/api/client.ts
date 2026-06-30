import type { ComparisonOut, JobStatus, TrackPayload } from "../types/payload";

const json = (r: Response) => {
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};

export const api = {
  list: (): Promise<ComparisonOut[]> =>
    fetch("/api/comparisons", { credentials: "include" }).then(json),

  get: (id: string): Promise<ComparisonOut> =>
    fetch(`/api/comparisons/${id}`, { credentials: "include" }).then(json),

  payload: (id: string, role: string): Promise<TrackPayload> =>
    fetch(`/api/comparisons/${id}/tracks/${role}/payload`, { credentials: "include" }).then(json),

  job: (id: string): Promise<JobStatus> =>
    fetch(`/api/jobs/${id}`, { credentials: "include" }).then(json),

  create: (mix: File, reference: File, name?: string): Promise<{ id: string; jobId: string }> => {
    const fd = new FormData();
    fd.append("mix", mix);
    fd.append("reference", reference);
    if (name) fd.append("name", name);
    return fetch("/api/comparisons", { method: "POST", body: fd, credentials: "include" }).then(json);
  },

  patch: (id: string, body: Record<string, unknown>): Promise<ComparisonOut> =>
    fetch(`/api/comparisons/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),

  swap: (id: string): Promise<ComparisonOut> =>
    fetch(`/api/comparisons/${id}/swap`, { method: "POST", credentials: "include" }).then(json),

  remove: (id: string): Promise<void> =>
    fetch(`/api/comparisons/${id}`, { method: "DELETE", credentials: "include" }).then(() => undefined),

  audio: (id: string, role: string): Promise<string> =>
    fetch(`/api/comparisons/${id}/tracks/${role}/audio`, { credentials: "include" })
      .then(json)
      .then((j: { url: string }) => j.url),
};
