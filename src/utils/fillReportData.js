const fs = require("fs");
const { SelectedCompData } = require("../data/ReportData");
const { report } = require("process");

/*========================================================================================
    fillCompAnalysis:
    This function fills the compAnalysis section of reportData in the reporting object

    Parameters:
    selectedCompsIds: selected propertyRecordIds of selected comps (Sold and Active)
    reporting: reporting object that contains all reporting data, including reportData
  =========================================================================================*/

const fillCompAnalysisDataMapping = (
  selecteCompType,
  selectedCompFlag,
  propData
) => {
  let reportToFill = SelectedCompData;

  reportToFill.selecteCompType = selecteCompType;
  reportToFill.selectedCompFlag = selectedCompFlag;
  reportToFill.percelNumber = propData.ids.apn || null;
  reportToFill.street = propData.address.street || null;
  reportToFill.city = propData.address.city || null;
  reportToFill.state = propData.address.state || null;
  reportToFill.zip = propData.address.zip || null;
  reportToFill.latitude = propData.address.latitude || null;
  reportToFill.longitude = propData.address.longitude || null;
  reportToFill.lastSalePrice = propData.sale.lastSale.price || null;
  reportToFill.lastSaleDate = propData.sale.lastSale.saleDate || null;
  reportToFill.yearBuilt = propData.building.yearBuilt || null;
  reportToFill.yearBuiltAdj = 0 || null;
  reportToFill.bed = propData.building.bedroomCount || null;
  reportToFill.bedAdj = 0 || null;
  reportToFill.bath = propData.building.calculatedBathroomCount || null;
  reportToFill.bathAdj = 0 || null;
  reportToFill.livingArea = propData.building.livingAreaSquareFeet || null;
  reportToFill.livingAreaAdj = 0 || null;
  reportToFill.basementArea = propData.building.basementSquareFeet || null;
  reportToFill.basementAreaAdj = 0 || null;
  reportToFill.heating = propData.building.heatSource || null;
  reportToFill.heatingAdj = 0 || null;
  reportToFill.ac = propData.building.airConditioningSource || null;
  reportToFill.acAdj = 0 || null;
  reportToFill.garage =
    String(propData.building.garageParkingSpaceCount) +
    "/" +
    propData.building.garage;
  reportToFill.garageAdj = 0 || null;
  reportToFill.pool = propData.building.pool || null;
  reportToFill.poolAdj = 0 || null;
  reportToFill.porch = propData.building.porch || null;
  reportToFill.porchAdj = 0 || null;
  reportToFill.patio = propData.building.patio || null;
  reportToFill.patioAdj = 0 || null;

  reportToFill.totalAdj = 0 || null;

  return reportToFill;
};

const fillCompAnalysis = (reporting) => {
  // Fill in subject property data
  reporting.reportData.compAnalysis.subject = fillCompAnalysisDataMapping(
    "Subject",
    "Subject",
    reporting.propertyData
  );

  // Fill in sold and active comps data
  const selectedCompsIds = reporting.valuationEstimate.selectedCompsIds;

  const compTypes = ["sold", "active"];

  compTypes.forEach((type) => {
    if (selectedCompsIds[type].length > 0) {
      const foundComps = [];
      for (let i = 0; i < selectedCompsIds[type].length; i++) {
        const selectedComp = selectedCompsIds[type][i];
        const compFlag = Object.keys(selectedComp)[0];
        const compData = reporting.compsData.find(
          (obj) => obj.propertyRecordId === selectedComp[compFlag]
        );
        const filledData = fillCompAnalysisDataMapping(
          compFlag,
          compFlag,
          compData
        );
        foundComps.push({ ...filledData });
      }

      // reporting.reportData.compAnalysis[type].push([...foundComps]);
      reporting.reportData.compAnalysis[type] = foundComps;
    }
  });

  return reporting;
};

module.exports = {
  fillCompAnalysis,
};
