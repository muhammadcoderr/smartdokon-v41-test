const moment = require('moment');
const { notifyAdmins, setBot } = require('../shared/helpers/botHelper');

const deletedProduct = async (data) => {
  const updatedAtFormatted = moment(data.updatedAt).format('YYYY-MM-DD HH:mm:ss');
  let message = `🗑 <b>Diqqat! Quyidagi mahsulot o'chirib tashlandi:</b>\n\n`;
  message += `🪫 Mahsulot: ${data.name}\n`;
  message += `🎯 Kategoriyasi: ${data.category}\n`;
  message += `💰 Kelish: ${data.arrivalprice.toLocaleString()} UZS\n`;
  message += `💰 Sotish: ${data.sellingprice.toLocaleString()} UZS\n`;
  message += `💡 Qoldi: ${data.avialable}\n`;
  message += `📔 Shtrix kodi: ${data.barcode}\n`;
  message += `⏳ Vaqt: ${updatedAtFormatted}`;

  await notifyAdmins(message);
};

module.exports = { setBot, deletedProduct };
