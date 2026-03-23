// src/config/mortgageCatalog.js

export const SBU = 482; // salario básico 2026

export const mortgageCatalog = [
  // ===============================
  // VIS - tasa preferencial
  // ===============================
  {
    id: "VIS",
    name: "Vivienda de Interés Social",
    segment: "VIS",
    channel: "PRIVATE_BANK",

    rate: {
      type: "fixed",
      annual: 0.0499,
    },

    term: {
      minYears: 5,
      maxYears: 30,
      defaultYears: 25,
      maxAgeAtMaturity: 75,
    },

    caps: {
      propertyMin: 0,
      propertyMax: 178 * SBU,
      incomeMin: 0,
      incomeMax: 3 * SBU,
      loanCap: null,
    },

    rules: {
      firstHome: true,
      newConstruction: true,
      requireIESS: false,
      requireContributions: false,
      minYearsEmployedDep: 1,
      minYearsRucInd: 2,
      allowsForeign: true,
      allowsBuroMora: false,
      allowsBuroRegularizado: true,
    },

    risk: {
      ltvMax: 0.95,
      dtiMax: 0.45,
      downPaymentMinPct: 0.05,
    },
  },

  // ===============================
  // VIP
  // ===============================
  {
    id: "VIP",
    name: "Vivienda de Interés Público",
    segment: "VIP",
    channel: "PRIVATE_BANK",

    rate: {
      type: "fixed",
      annual: 0.0499,
    },

    term: {
      minYears: 5,
      maxYears: 30,
      defaultYears: 25,
      maxAgeAtMaturity: 75,
    },

    caps: {
      propertyMin: 0,
      propertyMax: 229 * SBU,
      incomeMin: 0,
      incomeMax: 6.34 * SBU,
      loanCap: null,
    },

    rules: {
      firstHome: true,
      newConstruction: true,
      requireIESS: false,
      requireContributions: false,
      minYearsEmployedDep: 1,
      minYearsRucInd: 2,
      allowsForeign: true,
      allowsBuroMora: false,
      allowsBuroRegularizado: true,
    },

    risk: {
      ltvMax: 0.95,
      dtiMax: 0.45,
      downPaymentMinPct: 0.05,
    },
  },

  // ===============================
  // VIS II subsidio
  // ===============================
  {
    id: "VIS_II",
    name: "VIS II Subsidio Estatal",
    segment: "SUBSIDY",
    category: "DIRECT_SUBSIDY",

    subsidy: {
      maxAmount: 7050,
    },

    caps: {
      propertyMin: 0,
      propertyMax: 102 * SBU,
      incomeMin: 0,
      incomeMax: 3.5 * SBU,
    },

    rules: {
      firstHome: true,
      newConstruction: true,
      requireIESS: false,
      requireContributions: false,
      allowsForeign: true,
      allowsBuroMora: false,
      allowsBuroRegularizado: true,
    },
  },

  // ===============================
  // BIESS PREMIER / CREDICASA 2.99%
  // Hasta 71,504.70
  // Hasta 100% financiamiento
  // Primera vivienda, nueva, primer uso
  // Ingreso familiar máx. 1,527.94
  // ===============================
  {
    id: "BIESS_CREDICASA",
    name: "BIESS Vivienda Premier 2.99%",
    segment: "BIESS",
    channel: "BIESS",
    biessTier: "PREMIER",

    rate: {
      type: "fixed",
      annual: 0.0299,
    },

    term: {
      minYears: 5,
      maxYears: 25,
      defaultYears: 25,
      maxAgeAtMaturity: 77,
    },

    caps: {
      propertyMin: 0,
      propertyMax: 71504.7,
      incomeMin: 0,
      incomeMax: 1527.94,
      loanCap: 71504.7,
    },

    rules: {
      requireIESS: true,
      requireContributions: true,

      // Base legacy, para compatibilidad con tu matcher actual
      minContribTotalMonths: 36,
      minContribConsecutiveMonths: 13,

      // Reglas BIESS más específicas
      eligibleApplicantTypes: [
        "dependiente",
        "independiente",
        "voluntario",
        "jubilado",
        "discapacidad",
      ],
      minContribTotalMonthsDependent: 36,
      minContribConsecutiveMonthsDependent: 13,
      minContribTotalMonthsIndependent: 36,
      minContribConsecutiveMonthsIndependent: 36,
      minContribTotalMonthsVoluntary: 36,
      minContribConsecutiveMonthsVoluntary: 36,
      minContribTotalMonthsDisability: 18,
      requirePensionForRetirees: true,

      firstHome: true,
      newConstruction: true,
      firstUseOnly: true,

      minYearsEmployedDep: 1,
      minYearsRucInd: 2,
      allowsForeign: true,
      allowsBuroMora: false,
      allowsBuroRegularizado: true,

      maxAgeAtApplication: 77,
      maxAgePlusTerm: 80,
    },

    risk: {
      ltvMax: 1.0,
      dtiMax: 0.4,
      downPaymentMinPct: 0.0,
    },
  },

  // ===============================
  // BIESS VIS / VIP
  // 71,505 - 105,000
  // 4.99%
  // Hasta 95%
  // ===============================
  {
    id: "BIESS_VIS_VIP",
    name: "BIESS Vivienda VIS / VIP",
    segment: "BIESS",
    channel: "BIESS",
    biessTier: "VIS_VIP",

    rate: {
      type: "fixed",
      annual: 0.0499,
    },

    term: {
      minYears: 5,
      maxYears: 25,
      defaultYears: 25,
      maxAgeAtMaturity: 77,
    },

    caps: {
      propertyMin: 71505,
      propertyMax: 105000,
      incomeMin: 0,
      incomeMax: null,
      loanCap: 99750, // 95% de 105,000
    },

    rules: {
      requireIESS: true,
      requireContributions: true,

      // Base legacy
      minContribTotalMonths: 36,
      minContribConsecutiveMonths: 13,

      // Reglas BIESS más específicas
      eligibleApplicantTypes: [
        "dependiente",
        "independiente",
        "voluntario",
        "jubilado",
        "discapacidad",
      ],
      minContribTotalMonthsDependent: 36,
      minContribConsecutiveMonthsDependent: 13,
      minContribTotalMonthsIndependent: 36,
      minContribConsecutiveMonthsIndependent: 36,
      minContribTotalMonthsVoluntary: 36,
      minContribConsecutiveMonthsVoluntary: 36,
      minContribTotalMonthsDisability: 18,
      requirePensionForRetirees: true,

      firstHome: false,
      newConstruction: false,
      requiresMiduviQualifiedProject: true,

      minYearsEmployedDep: 1,
      minYearsRucInd: 2,
      allowsForeign: true,
      allowsBuroMora: false,
      allowsBuroRegularizado: true,

      maxAgeAtApplication: 77,
      maxAgePlusTerm: 80,
    },

    risk: {
      ltvMax: 0.95,
      dtiMax: 0.4,
      downPaymentMinPct: 0.05,
    },
  },

  // ===============================
  // BIESS Vivienda Media
  // 105,001 - 130,000
  // 6.99%
  // Hasta 95%
  // ===============================
  {
    id: "BIESS_MEDIA",
    name: "BIESS Vivienda Media",
    segment: "BIESS",
    channel: "BIESS",
    biessTier: "MEDIA",

    rate: {
      type: "fixed",
      annual: 0.0699,
    },

    term: {
      minYears: 5,
      maxYears: 25,
      defaultYears: 25,
      maxAgeAtMaturity: 77,
    },

    caps: {
      propertyMin: 105001,
      propertyMax: 130000,
      incomeMin: 0,
      incomeMax: null,
      loanCap: 123500, // 95% de 130,000
    },

    rules: {
      requireIESS: true,
      requireContributions: true,

      // Base legacy
      minContribTotalMonths: 36,
      minContribConsecutiveMonths: 13,

      // Reglas BIESS más específicas
      eligibleApplicantTypes: [
        "dependiente",
        "independiente",
        "voluntario",
        "jubilado",
        "discapacidad",
      ],
      minContribTotalMonthsDependent: 36,
      minContribConsecutiveMonthsDependent: 13,
      minContribTotalMonthsIndependent: 36,
      minContribConsecutiveMonthsIndependent: 36,
      minContribTotalMonthsVoluntary: 36,
      minContribConsecutiveMonthsVoluntary: 36,
      minContribTotalMonthsDisability: 18,
      requirePensionForRetirees: true,

      firstHome: false,
      newConstruction: false,

      minYearsEmployedDep: 1,
      minYearsRucInd: 2,
      allowsForeign: true,
      allowsBuroMora: false,
      allowsBuroRegularizado: true,

      maxAgeAtApplication: 77,
      maxAgePlusTerm: 80,
    },

    risk: {
      ltvMax: 0.95,
      dtiMax: 0.4,
      downPaymentMinPct: 0.05,
    },
  },

  // ===============================
  // BIESS Vivienda Alta
  // 130,001 - 200,000
  // 7.99%
  // Hasta 90%
  // ===============================
  {
    id: "BIESS_ALTA",
    name: "BIESS Vivienda Alta",
    segment: "BIESS",
    channel: "BIESS",
    biessTier: "ALTA",

    rate: {
      type: "fixed",
      annual: 0.0799,
    },

    term: {
      minYears: 5,
      maxYears: 25,
      defaultYears: 25,
      maxAgeAtMaturity: 77,
    },

    caps: {
      propertyMin: 130001,
      propertyMax: 200000,
      incomeMin: 0,
      incomeMax: null,
      loanCap: 180000, // 90% de 200,000
    },

    rules: {
      requireIESS: true,
      requireContributions: true,

      // Base legacy
      minContribTotalMonths: 36,
      minContribConsecutiveMonths: 13,

      // Reglas BIESS más específicas
      eligibleApplicantTypes: [
        "dependiente",
        "independiente",
        "voluntario",
        "jubilado",
        "discapacidad",
      ],
      minContribTotalMonthsDependent: 36,
      minContribConsecutiveMonthsDependent: 13,
      minContribTotalMonthsIndependent: 36,
      minContribConsecutiveMonthsIndependent: 36,
      minContribTotalMonthsVoluntary: 36,
      minContribConsecutiveMonthsVoluntary: 36,
      minContribTotalMonthsDisability: 18,
      requirePensionForRetirees: true,

      firstHome: false,
      newConstruction: false,

      minYearsEmployedDep: 1,
      minYearsRucInd: 2,
      allowsForeign: true,
      allowsBuroMora: false,
      allowsBuroRegularizado: true,

      maxAgeAtApplication: 77,
      maxAgePlusTerm: 80,
    },

    risk: {
      ltvMax: 0.9,
      dtiMax: 0.4,
      downPaymentMinPct: 0.1,
    },
  },

  // ===============================
  // BIESS Vivienda de Lujo
  // > 200,000
  // 8.50% base en catálogo
  // Hasta 80%
  // Techo máximo de financiamiento: 460,000
  // ===============================
  {
    id: "BIESS_LUJO",
    name: "BIESS Vivienda de Lujo",
    segment: "BIESS",
    channel: "BIESS",
    biessTier: "LUJO",

    rate: {
      type: "fixed",
      annual: 0.085,
    },

    term: {
      minYears: 5,
      maxYears: 25,
      defaultYears: 25,
      maxAgeAtMaturity: 77,
    },

    caps: {
      propertyMin: 200000.01,
      propertyMax: null,
      incomeMin: 0,
      incomeMax: null,
      loanCap: 460000,
    },

    rules: {
      requireIESS: true,
      requireContributions: true,

      // Base legacy
      minContribTotalMonths: 36,
      minContribConsecutiveMonths: 13,

      // Reglas BIESS más específicas
      eligibleApplicantTypes: [
        "dependiente",
        "independiente",
        "voluntario",
        "jubilado",
        "discapacidad",
      ],
      minContribTotalMonthsDependent: 36,
      minContribConsecutiveMonthsDependent: 13,
      minContribTotalMonthsIndependent: 36,
      minContribConsecutiveMonthsIndependent: 36,
      minContribTotalMonthsVoluntary: 36,
      minContribConsecutiveMonthsVoluntary: 36,
      minContribTotalMonthsDisability: 18,
      requirePensionForRetirees: true,

      firstHome: false,
      newConstruction: false,

      minYearsEmployedDep: 1,
      minYearsRucInd: 2,
      allowsForeign: true,
      allowsBuroMora: false,
      allowsBuroRegularizado: true,

      maxAgeAtApplication: 77,
      maxAgePlusTerm: 80,
    },

    risk: {
      ltvMax: 0.8,
      dtiMax: 0.4,
      downPaymentMinPct: 0.2,
    },
  },

  // ===============================
  // banca privada normal
  // ===============================
  {
    id: "PRIVATE",
    name: "Hipoteca Privada",
    segment: "PRIVATE",
    channel: "PRIVATE_BANK",

    rate: {
      type: "fixed",
      annual: 0.075,
    },

    term: {
      minYears: 5,
      maxYears: 25,
      defaultYears: 25,
      maxAgeAtMaturity: 75,
    },

    caps: {
      propertyMin: 0,
      propertyMax: null,
      incomeMin: 0,
      incomeMax: null,
      loanCap: null,
    },

    rules: {
      firstHome: false,
      newConstruction: false,
      requireIESS: false,
      requireContributions: false,
      minYearsEmployedDep: 1,
      minYearsRucInd: 2,
      allowsForeign: true,
      allowsBuroMora: false,
      allowsBuroRegularizado: true,
    },

    risk: {
      ltvMax: 0.8,
      dtiMax: 0.4,
      downPaymentMinPct: 0.2,
    },
  },
];