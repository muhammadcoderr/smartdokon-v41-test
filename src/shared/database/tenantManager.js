const mongoose = require("mongoose");
require("dotenv").config();

const connections = {};

/**
 * Filial uchun ma'lumotlar bazasiga ulanishni qaytaradi.
 * Agar mongoUri mavjud bo'lsa, o'sha clusterga ulanadi.
 * Aks holda asosiy cluster ichidagi dbName bazasidan foydalanadi.
 */
const getTenantConnection = async (dbName, customUri = null) => {
  const cacheKey = customUri || dbName;

  if (connections[cacheKey]) {
    if (connections[cacheKey].readyState === 1) {
      return connections[cacheKey];
    }
  }

  let dbUri = "";
  
  if (customUri) {
    // Agar maxsus Cluster linki berilgan bo'lsa
    dbUri = customUri;
    console.log(`Maxsus Clusterga ulanish: ${dbUri.split('@')[1] || 'hidden'}`);
  } else {
    // Asosiy Cluster ichidagi alohida bazaga ulanish
    const baseUri = process.env.MONGO_URL;
    dbUri = baseUri.substring(0, baseUri.lastIndexOf("/")) + "/" + dbName;
    console.log(`Asosiy Cluster ichidagi bazaga ulanish: ${dbName}`);
  }
  
  try {
    const conn = await mongoose.createConnection(dbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).asPromise();

    connections[cacheKey] = conn;
    return conn;
  } catch (error) {
    console.error(`DB Connection Error (${cacheKey}):`, error.message);
    throw error;
  }
};

module.exports = {
  getTenantConnection,
};
