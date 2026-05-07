/***************************************
 * 01_PropsUtils.gs
 ***************************************/

function getScriptProperty(key, defaultValue) {
  const fallback = defaultValue == null ? '' : String(defaultValue);
  const props = PropertiesService.getScriptProperties();
  return props.getProperty(key) || fallback;
}

function setScriptProperty(key, value) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(key, String(value));
}

function deleteScriptProperty(key) {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(key);
}

function generateUuid() {
  return Utilities.getUuid();
}
