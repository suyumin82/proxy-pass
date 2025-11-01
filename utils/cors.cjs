const setCORS = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // Or restrict to specific domain
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  res.setHeader("Access-Control-Allow-Credentials", "true");
};

module.exports = setCORS;