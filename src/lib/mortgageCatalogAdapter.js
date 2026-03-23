// src/lib/mortgageCatalogAdapter.js

import { mortgageCatalog } from "../config/mortgageCatalog.js";

const toFiniteOr = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toNullableNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toInfinityIfNull = (value) => {
  if (value == null) return Infinity;
  const n = Number(value);
  return Number.isFinite(n) ? n : Infinity;
};

function inferLegacyBucket(product) {
  const id = String(product?.id || "").toUpperCase();
  const segment = String(product?.segment || "").toUpperCase();
  const channel = String(product?.channel || "").toUpperCase();

  if (id === "VIS") return "VIS";
  if (id === "VIP") return "VIP";
  if (id === "VIS_II") return "VIS_II";

  if (channel === "BIESS") {
    if (id === "BIESS_CREDICASA") return "BIESS_PREF";
    return "BIESS_STD";
  }

  if (id === "PRIVATE" || segment === "PRIVATE") return "PRIVATE";

  return "OTHER";
}

function buildProductTags(product) {
  const id = String(product?.id || "").toUpperCase();
  const segment = String(product?.segment || "").toUpperCase();
  const rules = product?.rules || {};

  return {
    isVIS: id === "VIS",
    isVIP: id === "VIP",
    isVISSubsidy: id === "VIS_II",
    isBIESS: segment === "BIESS",
    isPrivate: id === "PRIVATE" || segment === "PRIVATE",
    isSubsidy: segment === "SUBSIDY",
    firstHomeOnly: !!rules.firstHome,
    newConstructionOnly: !!rules.newConstruction,
    requiresIESS: !!rules.requireIESS,
    requiresContributions: !!rules.requireContributions,
    requiresMiduviQualifiedProject: !!rules.requiresMiduviQualifiedProject,
    firstUseOnly: !!rules.firstUseOnly,
  };
}

export function adaptMortgageProduct(product) {
  const rate = product?.rate || {};
  const term = product?.term || {};
  const caps = product?.caps || {};
  const rules = product?.rules || {};
  const risk = product?.risk || {};

  return {
    productId: product.id,
    id: product.id,
    name: product.name,
    displayName: product.name,
    segment: product.segment || null,
    channel: product.channel || null,
    category: product.category || null,
    biessTier: product.biessTier || null,
    legacyBucket: inferLegacyBucket(product),

    tasaAnual: toNullableNumber(rate.annual),
    rateType: rate.type || "fixed",

    plazoMinAnios: toFiniteOr(term.minYears, 5),
    plazoMaxAnios: toFiniteOr(term.maxYears, 25),
    plazoDefaultAnios: toFiniteOr(term.defaultYears, 25),
    maxAgeAtMaturity: toFiniteOr(term.maxAgeAtMaturity, 75),

    propertyMin: toFiniteOr(caps.propertyMin, 0),
    propertyMax: toInfinityIfNull(caps.propertyMax),
    incomeMin: toFiniteOr(caps.incomeMin, 0),
    incomeMax: toInfinityIfNull(caps.incomeMax),
    loanCap: caps.loanCap == null ? null : toNullableNumber(caps.loanCap),

    firstHomeOnly: !!rules.firstHome,
    requireNewBuild: !!rules.newConstruction,
    requireIESS: !!rules.requireIESS,
    requireContribs: !!rules.requireContributions,
    firstUseOnly: !!rules.firstUseOnly,
    requiresMiduviQualifiedProject: !!rules.requiresMiduviQualifiedProject,

    minYearsEmployedDep: toFiniteOr(rules.minYearsEmployedDep, 1),
    minYearsRucInd: toFiniteOr(rules.minYearsRucInd, 2),

    minContribTotalMonths: toNullableNumber(rules.minContribTotalMonths),
    minContribConsecutiveMonths: toNullableNumber(
      rules.minContribConsecutiveMonths
    ),

    minContribTotalMonthsDependent: toNullableNumber(
      rules.minContribTotalMonthsDependent
    ),
    minContribConsecutiveMonthsDependent: toNullableNumber(
      rules.minContribConsecutiveMonthsDependent
    ),
    minContribTotalMonthsIndependent: toNullableNumber(
      rules.minContribTotalMonthsIndependent
    ),
    minContribConsecutiveMonthsIndependent: toNullableNumber(
      rules.minContribConsecutiveMonthsIndependent
    ),
    minContribTotalMonthsVoluntary: toNullableNumber(
      rules.minContribTotalMonthsVoluntary
    ),
    minContribConsecutiveMonthsVoluntary: toNullableNumber(
      rules.minContribConsecutiveMonthsVoluntary
    ),
    minContribTotalMonthsDisability: toNullableNumber(
      rules.minContribTotalMonthsDisability
    ),

    eligibleApplicantTypes: Array.isArray(rules.eligibleApplicantTypes)
      ? rules.eligibleApplicantTypes
      : [],

    requirePensionForRetirees: !!rules.requirePensionForRetirees,
    maxAgeAtApplication: toNullableNumber(rules.maxAgeAtApplication),
    maxAgePlusTerm: toNullableNumber(rules.maxAgePlusTerm),

    allowsForeign:
      typeof rules.allowsForeign === "boolean" ? rules.allowsForeign : true,
    allowsBuroMora:
      typeof rules.allowsBuroMora === "boolean" ? rules.allowsBuroMora : false,
    allowsBuroRegularizado:
      typeof rules.allowsBuroRegularizado === "boolean"
        ? rules.allowsBuroRegularizado
        : true,

    ltvMax: toFiniteOr(risk.ltvMax, 0.8),
    dtiMax: toFiniteOr(risk.dtiMax, 0.4),
    downPaymentMinPct: toFiniteOr(risk.downPaymentMinPct, 0.2),

    subsidyMaxAmount: toNullableNumber(product?.subsidy?.maxAmount),

    tags: buildProductTags(product),

    raw: product,
  };
}

export function getCatalogProductsForScoring() {
  return mortgageCatalog.map(adaptMortgageProduct);
}

export function getCatalogProductMap() {
  return Object.fromEntries(
    getCatalogProductsForScoring().map((p) => [p.productId, p])
  );
}

export function getCatalogProductsByLegacyBucket(bucket) {
  const key = String(bucket || "").toUpperCase();
  return getCatalogProductsForScoring().filter((p) => p.legacyBucket === key);
}

export default getCatalogProductsForScoring;