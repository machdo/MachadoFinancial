const LS_DEFAULT_ACCOUNT = "fincontrol:defaultAccountId";

export function getDefaultAccountId() {
  return localStorage.getItem(LS_DEFAULT_ACCOUNT) || "";
}

export function setDefaultAccountId(accountId) {
  const value = String(accountId ?? "").trim();
  if (!value) {
    localStorage.removeItem(LS_DEFAULT_ACCOUNT);
    return;
  }
  localStorage.setItem(LS_DEFAULT_ACCOUNT, value);
}
