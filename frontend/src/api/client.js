const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function getSummary() {
  const response = await fetch(`${API_BASE_URL}/api/summary`);

  if (!response.ok) {
    throw new Error("Failed to fetch project summary.");
  }

  return response.json();
}
