const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
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
