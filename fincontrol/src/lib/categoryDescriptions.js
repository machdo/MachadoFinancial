const LS_CATEGORY_DESCRIPTIONS = "fincontrol:categoryDescriptionPresets:v1";

const FALLBACK_SUGGESTIONS = [
  "Pagamento recorrente",
  "Compra do dia",
  "Servico",
  "Ajuste financeiro",
];

function normalizeDescription(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeList(list) {
  const output = [];
  const seen = new Set();

  for (const item of list ?? []) {
    const normalized = normalizeDescription(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }

  return output.slice(0, 20);
}

function readStorage() {
  try {
    const raw = localStorage.getItem(LS_CATEGORY_DESCRIPTIONS);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const normalized = {};
    for (const [categoryId, list] of Object.entries(parsed)) {
      normalized[String(categoryId)] = normalizeList(Array.isArray(list) ? list : []);
    }
    return normalized;
  } catch {
    return {};
  }
}

function writeStorage(map) {
  localStorage.setItem(LS_CATEGORY_DESCRIPTIONS, JSON.stringify(map));
}

function suggestionsByCategoryName(name) {
  const value = String(name ?? "").toLowerCase();

  if (value.includes("aliment")) {
    return ["Almoco", "Jantar", "Mercado", "Lanche"];
  }
  if (value.includes("transporte") || value.includes("mobilidade")) {
    return ["Uber", "Combustivel", "Onibus", "Estacionamento"];
  }
  if (value.includes("moradia") || value.includes("casa")) {
    return ["Aluguel", "Condominio", "Energia", "Internet"];
  }
  if (value.includes("saude")) {
    return ["Farmacia", "Consulta", "Exame", "Plano de saude"];
  }
  if (value.includes("lazer")) {
    return ["Cinema", "Streaming", "Passeio", "Restaurante"];
  }

  return FALLBACK_SUGGESTIONS;
}

export function getCategoryDescriptionMap() {
  return readStorage();
}

export function getDefaultDescriptionSuggestions(categoryName) {
  return suggestionsByCategoryName(categoryName);
}

export function getDescriptionSuggestionsForCategory(category) {
  if (!category?.id) return FALLBACK_SUGGESTIONS;

  const map = readStorage();
  const custom = map[String(category.id)] ?? [];
  if (custom.length > 0) return custom;

  return suggestionsByCategoryName(category.name);
}

export function addCategoryDescriptionPreset(categoryId, description) {
  if (!categoryId) return [];

  const map = readStorage();
  const key = String(categoryId);
  const current = map[key] ?? [];
  const updated = normalizeList([...current, description]);
  map[key] = updated;
  writeStorage(map);
  return updated;
}

export function removeCategoryDescriptionPreset(categoryId, description) {
  if (!categoryId) return [];

  const map = readStorage();
  const key = String(categoryId);
  const current = map[key] ?? [];
  const target = normalizeDescription(description).toLowerCase();
  const updated = current.filter((item) => item.toLowerCase() !== target);

  if (updated.length > 0) map[key] = updated;
  else delete map[key];

  writeStorage(map);
  return updated;
}
