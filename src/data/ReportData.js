const ReportData = {
  // compAnalysis: { subject: {}, sold: [], list: [] },
  bpo: {
    orderInformation: {},
    propertyInformation: {},
    neighborhoodInformation: {},
  },
  dvr: {
    
  }
};

const SelectedCompData = {
  dataValues: {
    selectedCompType: null,
    selectedCompFlag: null,
    percelNumber: null,
    street: null,
    city: null,
    state: null,
    zip: null,
    latitude: null,
    longitude: null,
    lastSalePrice: null,
    lastSaleDate: null,
    yearBuilt: null,
    bed: null,
    bath: null,
    livingArea: null,
    basementArea: null,
    heating: null,
    ac: null,
    garage: null,
    pool: null,
    porch: null,
    patio: null,
    total: null,
  },
  adjustments: {
    yearBuiltAdj: null,
    bedAdj: null,
    bathAdj: null,
    livingAreaAdj: null,
    basementAreaAdj: null,
    heatingAdj: null,
    acAdj: null,
    garageAdj: null,
    poolAdj: null,
    porchAdj: null,
    patioAdj: null,
    totalAdj: null,
  },
};

module.exports = {
  ReportData,
  SelectedCompData,
};
