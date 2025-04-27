const getValueFromAppConfig = async function (
  appConfigClient,
  key,
  label = ""
) {
  let value;

  const sampleKeys = appConfigClient.listConfigurationSettings({
    keyFilter: key + "*",
    labelFilter: label + "*",
  });

  for await (const setting of sampleKeys) {
    // console.log(`  Found key: ${setting.key}, value: ${setting.value}, label: ${setting.label}`);
    if (setting.value !== undefined && setting.value != "") {
      value = setting.value;
    }
  }

  return value;
};

module.exports = {
  getValueFromAppConfig
};