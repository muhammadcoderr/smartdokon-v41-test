const moment = require('moment');
const { notifyAdmins, setBot } = require('../shared/helpers/botHelper');

const monitorStock = async (data) => {
  const updatedAtFormatted = moment(data.updatedAt).format('YYYY-MM-DD HH:mm:ss');
  let message = `🚨 <b>Diqqat! Quyidagi mahsulotning zaxirasi tugadi:</b>\n\n`;
  message += `🪫 Mahsulot: ${data.name}\n`;
  message += `💡 Qoldi: ${data.avialable}\n`;
  message += `⏳ Sana: ${updatedAtFormatted}`;

  await notifyAdmins(message);
};

module.exports = { setBot, monitorStock };
