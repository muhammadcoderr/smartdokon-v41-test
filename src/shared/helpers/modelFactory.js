/**
 * Model Factory: Dinamik ulanishlar uchun modellarni yaratish.
 * Bu orqali har bir filial o'z bazasidagi jadval bilan ishlaydi.
 */
const getModel = (connection, modelName, schema) => {
  if (connection.models[modelName]) {
    return connection.models[modelName];
  }
  return connection.model(modelName, schema);
};

module.exports = {
  getModel,
};
