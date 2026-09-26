const SELECTED_RATE_KEY = "selected_rate";

export function saveSelectedRate(data: any) {
  localStorage.setItem(SELECTED_RATE_KEY, JSON.stringify(data));
}

export function getSelectedRate() {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem(SELECTED_RATE_KEY);
  return data ? JSON.parse(data) : null;
}

export function clearSelectedRate() {
  localStorage.removeItem(SELECTED_RATE_KEY);
}