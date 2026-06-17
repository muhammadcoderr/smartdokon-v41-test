const moment = require('moment');
const { notifyAdmins, setBot } = require('../shared/helpers/botHelper');

const ProductNumber = async (data, quantity) => {
  const updatedAtFormatted = moment(data.updatedAt).format('YYYY-MM-DD HH:mm:ss');
  let message = `❌ <b>Diqqat! Quyidagi mahsulot minusga sotildi:</b>\n\n`;
  message += `🪫 Mahsulot: ${data.name}\n`;
  message += `🎯 Kategoriyasi: ${data.category}\n`;
  message += `💰 Kelish narxi: ${data.arrivalprice.toLocaleString()} UZS\n`;
  message += `💰 Sotish narxi: ${data.sellingprice.toLocaleString()} UZS\n`;
  message += `📦 Sotilgan miqdor: ${quantity} ta\n`; 
  message += `💡 Jami minusdagi soni: ${data.avialable} ta\n`; 
  message += `📔 Shtrix kodi: ${data.barcode}\n`;
  message += `⏳ Vaqt: ${updatedAtFormatted}`;

  await notifyAdmins(message);
};

module.exports = { setBot, ProductNumber };
