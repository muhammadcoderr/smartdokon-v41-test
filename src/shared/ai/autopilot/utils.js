const dashboardTimezone =
  process.env.APP_TIMEZONE || process.env.CRON_TIMEZONE || "Asia/Tashkent";

const getDateStringInTimezone = (date, timeZone = dashboardTimezone) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

const sumProductProfit = (products = []) =>
  products.reduce((sum, product) => sum + Number(product?.profit || 0), 0);

const sumProductQuantity = (products = []) =>
  products.reduce((sum, product) => sum + Number(product?.quantity || 0), 0);

const formatMoney = (value) =>
  new Intl.NumberFormat("uz-UZ").format(Number(value || 0));

const buildPriority = (score) => {
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  return "low";
};

const buildDebtAdvice = (client) => {
  if (client.totalDebt >= 1000000) {
    return "Telefon va to'lov jadvali bilan zudlik bilan bog'laning.";
  }
  if (client.oldestDebtDays >= 30) {
    return "Qisman to'lov yoki muddatli qaytarish rejasi taklif qiling.";
  }
  return "Eslatma yuborib, keyingi savdoni faqat qisman oldindan to'lov bilan tasdiqlang.";
};

module.exports = {
  dashboardTimezone,
  getDateStringInTimezone,
  sumProductProfit,
  sumProductQuantity,
  formatMoney,
  buildPriority,
  buildDebtAdvice,
};
