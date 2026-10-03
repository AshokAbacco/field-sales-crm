import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "fsc_token";

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => {
    try {
      t
        ? localStorage.setItem(TOKEN_KEY, t)
        : localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 30000 });

api.interceptors.request.use((cfg) => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config?.url?.includes("/auth/login")
    )
      onUnauthorized();
    return Promise.reject(err);
  },
);

export const errMsg = (err, fallback = "Something went wrong") =>
  err?.response?.data?.error ||
  (err?.code === "ECONNABORTED"
    ? "Request timed out"
    : err?.message === "Network Error"
      ? "Network error – check your connection"
      : fallback);

/** Authenticated URL for protected uploads used in <img> */
export const fileUrl = (path) =>
  !path
    ? null
    : /^https?:\/\//.test(path)
      ? path
      : `${API_URL}${path}?token=${encodeURIComponent(tokenStore.get() || "")}`;

/** Download a server export as a file */
export function downloadExport(type, format, params = {}) {
  return downloadFile(
    `/exports/${type}`,
    { ...params, format },
    `${type}.${format}`,
  );
}

/** Download any authenticated API file response */
export async function downloadFile(
  path,
  params = {},
  fallbackName = "download",
) {
  const res = await api.get(path, {
    params,
    responseType: "blob",
    timeout: 300000,
  });
  const cd = res.headers["content-disposition"] || "";
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
