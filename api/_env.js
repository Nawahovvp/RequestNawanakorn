const setDefault = (key, value) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
};

setDefault('OPEN_SHEET_BASE', 'https://opensheet.elk.sh');
setDefault('SHEET_ID_REQUEST', '1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE');
setDefault('SHEET_NAME_REQUEST', 'Request');
setDefault('SHEET_ID_MAIN_SAP', '1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw');
setDefault('SHEET_NAME_MAIN_SAP', 'MainSap');
setDefault('SHEET_ID_PENDING', '1dzE4Xjc7H0OtNUmne62u0jFQT-CiGsG2eBo-1v6mrZk');
setDefault('SHEET_NAME_PENDING', 'Call_Report');
setDefault('SHEET_ID_EMPLOYEE', '1eqVoLsZxGguEbRCC5rdI4iMVtQ7CK4T3uXRdx8zE3uw');
setDefault('SHEET_NAME_EMPLOYEE', 'Employee_Auth');
setDefault('SHEET_ID_IMAGE_DB', '1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw');
setDefault('SHEET_NAME_IMAGE_DB', 'imageMIx');
setDefault('SHEET_ID_ANNOUNCEMENT', '1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o');
setDefault('SHEET_NAME_ANNOUNCEMENT', 'information');
setDefault('GAS_URL', 'https://script.google.com/macros/s/AKfycbycEiGdjEFmLSPSqgBUBBntG0OnaatLTkNozlZTn0RRgZHiuL9HCWisIsmMqth9Dzrv/exec');
setDefault('GAS_ANNOUNCEMENT_URL', 'https://script.google.com/macros/s/AKfycbycEiGdjEFmLSPSqgBUBBntG0OnaatLTkNozlZTn0RRgZHiuL9HCWisIsmMqth9Dzrv/exec');
