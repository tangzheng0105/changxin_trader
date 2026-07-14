const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const TOKEN_KEY = "changxin_trader_token";

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const error = await response.json();
      message = error.detail ?? message;
    } catch {
      // Keep the status-based message.
    }
    throw new Error(message);
  }

  return response.json();
}

export function loginUser(payload) {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
}

export function getCurrentUser() {
  return request("/api/auth/me");
}

export function getTraderUsers() {
  return request("/api/auth/traders");
}

export function createTraderUser(payload) {
  return request("/api/auth/traders", { method: "POST", body: JSON.stringify(payload) });
}

export function getSummary() {
  return request("/api/summary");
}

export function getTraderStatus() {
  return request("/api/trader/status");
}

export function connectTrader() {
  return request("/api/trader/connect", { method: "POST" });
}

export function getAccountDetail() {
  return request("/api/trader/account");
}

export function getOrders() {
  return request("/api/trader/orders");
}

export function getDeals() {
  return request("/api/trader/deals");
}

export function getPositions() {
  return request("/api/trader/positions");
}

export function placeOrder(payload) {
  return request("/api/trader/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelCommand(payload) {
  return request("/api/trader/cancel-command", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelOrder(payload) {
  return request("/api/trader/cancel-order", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getStockPool() {
  return request("/api/stock-pool");
}

export function searchStockPool(query) {
  return request(`/api/stock-pool/search?query=${encodeURIComponent(query)}`);
}

export function addStockPool(codes) {
  return request("/api/stock-pool", {
    method: "POST",
    body: JSON.stringify({ codes }),
  });
}

export function updateStockPool(id, payload) {
  return request(`/api/stock-pool/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteStockPool(id) {
  return request(`/api/stock-pool/${id}`, { method: "DELETE" });
}

export function deleteStockPoolBatch(ids) {
  return request("/api/stock-pool", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}
