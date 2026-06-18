/**
 * SmartDokon Database Migration Script
 * Eski bazani yangi versiyaga moslashtirish uchun
 *
 * Ishlatish: node scripts/migration.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB ulanish
const MONGODB_URI = process.env.MONGO_URL || 'mongodb://localhost:27017/smartdokon';

console.log('🚀 SmartDokon Migration Script');
console.log('================================\n');

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB ga ulandi\n');
    } catch (error) {
        console.error('❌ MongoDB ulanish xatosi:', error.message);
        process.exit(1);
    }
}

// Migration statistikasi
const stats = {
    products: { updated: 0, skipped: 0 },
    clients: { updated: 0, skipped: 0 },
    debts: { updated: 0, skipped: 0 },
    costs: { updated: 0, skipped: 0 },
    sellers: { updated: 0, skipped: 0 },
    payments: { updated: 0, skipped: 0 },
    botUsers: { updated: 0, skipped: 0 },
};

// 1. Products Migration
async function migrateProducts() {
    console.log('📦 Products migration boshlandi...');
    const collection = mongoose.connection.collection('products');

    const cursor = collection.find({});

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const updates = {};

        // Yangi maydonlarni tekshirish va default qiymatlar qo'shish
        if (!doc.barcodes) {
            // Agar barcode mavjud bo'lsa, uni barcodes arrayga qo'shish
            updates.barcodes = doc.barcode ? [doc.barcode] : [];
        }
        if (doc.minimumStock === undefined) updates.minimumStock = 0;
        if (!doc.unit) updates.unit = 'Dona';
        if (doc.totalPurchased === undefined) updates.totalPurchased = 0;
        if (doc.totalSold === undefined) updates.totalSold = 0;
        if (doc.lastSoldDate === undefined) updates.lastSoldDate = null;
        if (doc.lastPurchaseDate === undefined) updates.lastPurchaseDate = null;
        if (doc.lastPurchasePrice === undefined) updates.lastPurchasePrice = null;
        if (!doc.supplierProductCode) updates.supplierProductCode = '';
        if (!doc.supplierName) updates.supplierName = doc.sellername || '';

        if (Object.keys(updates).length > 0) {
            await collection.updateOne({ _id: doc._id }, { $set: updates });
            stats.products.updated++;
        } else {
            stats.products.skipped++;
        }
    }

    console.log(`   ✅ ${stats.products.updated} ta mahsulot yangilandi, ${stats.products.skipped} ta o'zgarishsiz\n`);
}

// 2. Clients Migration
async function migrateClients() {
    console.log('👥 Clients migration boshlandi...');
    const collection = mongoose.connection.collection('clients');

    const cursor = collection.find({});

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const updates = {};

        if (!doc.paymentHistory) updates.paymentHistory = [];
        if (doc.bonus === undefined) updates.bonus = 0;
        if (!doc.referralCode) {
            // Unique referral code yaratish
            updates.referralCode = `REF${doc.phone || Date.now()}`;
        }

        if (Object.keys(updates).length > 0) {
            await collection.updateOne({ _id: doc._id }, { $set: updates });
            stats.clients.updated++;
        } else {
            stats.clients.skipped++;
        }
    }

    console.log(`   ✅ ${stats.clients.updated} ta mijoz yangilandi, ${stats.clients.skipped} ta o'zgarishsiz\n`);
}

// 3. Debts Migration
async function migrateDebts() {
    console.log('💰 Debts migration boshlandi...');
    const collection = mongoose.connection.collection('debts');

    const cursor = collection.find({});

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const updates = {};

        if (!doc.debtType) updates.debtType = 'client';
        if (!doc.status) updates.status = 'active';

        // totalAmount, paidAmount, remainingAmount hisoblash
        if (doc.totalAmount === undefined) {
            // Eski formatdan yangi formatga o'tkazish
            if (doc.amount && Array.isArray(doc.amount)) {
                let total = 0;
                let paid = 0;
                doc.amount.forEach(item => {
                    if (item.type === 'debt') total += item.amount || 0;
                    if (item.type === 'payment') paid += item.amount || 0;
                });
                updates.totalAmount = total;
                updates.paidAmount = paid;
                updates.remainingAmount = total - paid;
            } else {
                updates.totalAmount = 0;
                updates.paidAmount = 0;
                updates.remainingAmount = 0;
            }
        }

        if (Object.keys(updates).length > 0) {
            await collection.updateOne({ _id: doc._id }, { $set: updates });
            stats.debts.updated++;
        } else {
            stats.debts.skipped++;
        }
    }

    console.log(`   ✅ ${stats.debts.updated} ta qarz yangilandi, ${stats.debts.skipped} ta o'zgarishsiz\n`);
}

// 4. Costs Migration
async function migrateCosts() {
    console.log('💸 Costs migration boshlandi...');
    const collection = mongoose.connection.collection('costs');

    const cursor = collection.find({});

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const updates = {};

        if (!doc.paymentMethod) updates.paymentMethod = 'cash';
        if (!doc.category) updates.category = 'other';
        if (!doc.status) updates.status = 'completed';
        if (!doc.supplierName) updates.supplierName = doc.sellername || '';

        if (Object.keys(updates).length > 0) {
            await collection.updateOne({ _id: doc._id }, { $set: updates });
            stats.costs.updated++;
        } else {
            stats.costs.skipped++;
        }
    }

    console.log(`   ✅ ${stats.costs.updated} ta xarajat yangilandi, ${stats.costs.skipped} ta o'zgarishsiz\n`);
}

// 5. Sellers Migration
async function migrateSellers() {
    console.log('👤 Sellers migration boshlandi...');
    const collection = mongoose.connection.collection('sellers');

    const cursor = collection.find({});

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const updates = {};

        if (!doc.type) updates.type = 'sotuvchi';
        if (doc.refreshToken === undefined) updates.refreshToken = null;
        if (!doc.lastseen) updates.lastseen = new Date();

        if (Object.keys(updates).length > 0) {
            await collection.updateOne({ _id: doc._id }, { $set: updates });
            stats.sellers.updated++;
        } else {
            stats.sellers.skipped++;
        }
    }

    console.log(`   ✅ ${stats.sellers.updated} ta sotuvchi yangilandi, ${stats.sellers.skipped} ta o'zgarishsiz\n`);
}

// 6. Payments Migration
async function migratePayments() {
    console.log('🧾 Payments migration boshlandi...');
    const collection = mongoose.connection.collection('payments');

    const cursor = collection.find({});

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const updates = {};

        if (doc.cash === undefined) updates.cash = 0;
        if (doc.terminal === undefined) updates.terminal = 0;
        if (doc.cashback === undefined) updates.cashback = 0;
        if (doc.rate === undefined) updates.rate = 0;
        if (doc.indebtedness === undefined) updates.indebtedness = 0;
        if (doc.profit === undefined) updates.profit = 0;

        if (Object.keys(updates).length > 0) {
            await collection.updateOne({ _id: doc._id }, { $set: updates });
            stats.payments.updated++;
        } else {
            stats.payments.skipped++;
        }
    }

    console.log(`   ✅ ${stats.payments.updated} ta to'lov yangilandi, ${stats.payments.skipped} ta o'zgarishsiz\n`);
}

// 7. Bot Users Migration
async function migrateBotUsers() {
    console.log('🤖 Bot Users migration boshlandi...');
    const collection = mongoose.connection.collection('users');

    // Collection mavjudligini tekshirish
    const collections = await mongoose.connection.db.listCollections({ name: 'users' }).toArray();
    if (collections.length === 0) {
        console.log('   ⏭️  users collection mavjud emas, o\'tkazib yuborildi\n');
        return;
    }

    const cursor = collection.find({});

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const updates = {};

        if (doc.isClientBotUser === undefined) updates.isClientBotUser = false;
        if (!doc.username) updates.username = 'NoUsername';
        if (!doc.lastName) updates.lastName = '';
        if (!doc.role) updates.role = 'user';

        if (Object.keys(updates).length > 0) {
            await collection.updateOne({ _id: doc._id }, { $set: updates });
            stats.botUsers.updated++;
        } else {
            stats.botUsers.skipped++;
        }
    }

    console.log(`   ✅ ${stats.botUsers.updated} ta bot user yangilandi, ${stats.botUsers.skipped} ta o'zgarishsiz\n`);
}

// 8. Yangi collectionlar uchun indexlar yaratish
async function createIndexes() {
    console.log('🔧 Indexlar yaratilmoqda...');

    try {
        const productsCollection = mongoose.connection.collection('products');
        await productsCollection.createIndex({ supplierId: 1 });
        await productsCollection.createIndex({ supplierName: 1 });
        await productsCollection.createIndex({ category: 1 });
        await productsCollection.createIndex({ barcodes: 1 });
        console.log('   ✅ Products indexlari yaratildi');
    } catch (e) {
        console.log('   ⚠️  Products index xatosi (ehtimol mavjud):', e.message);
    }

    try {
        const clientsCollection = mongoose.connection.collection('clients');
        await clientsCollection.createIndex({ phone: 1 }, { unique: true });
        await clientsCollection.createIndex({ referralCode: 1 }, { unique: true, sparse: true });
        console.log('   ✅ Clients indexlari yaratildi');
    } catch (e) {
        console.log('   ⚠️  Clients index xatosi (ehtimol mavjud):', e.message);
    }

    console.log('');
}

// 9. BotSettings singleton yaratish
async function ensureBotSettings() {
    console.log('⚙️  BotSettings tekshirilmoqda...');
    const collection = mongoose.connection.collection('botsettings');

    const existing = await collection.findOne({});
    if (!existing) {
        await collection.insertOne({
            botToken: '',
            clientBotToken: '',
            isAdminBotActive: false,
            isClientBotActive: false,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ BotSettings yaratildi\n');
    } else {
        console.log('   ⏭️  BotSettings mavjud\n');
    }
}

// 10. CheckSetting singleton yaratish
async function ensureCheckSettings() {
    console.log('🧾 CheckSettings tekshirilmoqda...');
    const collection = mongoose.connection.collection('checksettings');

    const existing = await collection.findOne({});
    if (!existing) {
        await collection.insertOne({
            brandName: 'Smart Dokon',
            logoUrl: '',
            qrUrl: '',
            headerText: 'Xaridingiz uchun rahmat!',
            footerText: "Keling, ko'rishamiz!",
            showDebt: true,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ CheckSettings yaratildi\n');
    } else {
        console.log('   ⏭️  CheckSettings mavjud\n');
    }
}

// 11. MeasurementUnitSettings singleton yaratish
async function ensureMeasurementUnitSettings() {
    console.log('📏 MeasurementUnitSettings tekshirilmoqda...');
    const collection = mongoose.connection.collection('measurementunitsettings');

    const existing = await collection.findOne({});
    if (!existing) {
        await collection.insertOne({
            units: ['Dona', 'KG', 'Quti', 'Litr', 'Metr'],
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ MeasurementUnitSettings yaratildi\n');
    } else {
        console.log('   ⏭️  MeasurementUnitSettings mavjud\n');
    }
}

// 12. Cashbox singleton yaratish
async function ensureCashbox() {
    console.log('💵 Cashbox tekshirilmoqda...');
    const collection = mongoose.connection.collection('cashboxes');

    const existing = await collection.findOne({});
    if (!existing) {
        await collection.insertOne({
            cashBalance: 0,
            cardBalance: 0,
            bankBalance: 0,
            transactions: [],
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ Cashbox yaratildi\n');
    } else {
        console.log('   ⏭️  Cashbox mavjud\n');
    }
}

// Asosiy migration funksiyasi
async function runMigration() {
    await connectDB();

    console.log('🔄 Migration jarayoni boshlandi...\n');
    console.log('================================\n');

    // Collectionlarni migrate qilish
    await migrateProducts();
    await migrateClients();
    await migrateDebts();
    await migrateCosts();
    await migrateSellers();
    await migratePayments();
    await migrateBotUsers();

    // Indexlar yaratish
    await createIndexes();

    // Singleton dokumentlarni yaratish
    await ensureBotSettings();
    await ensureCheckSettings();
    await ensureMeasurementUnitSettings();
    await ensureCashbox();

    // Yakuniy statistika
    console.log('================================');
    console.log('📊 Migration yakunlandi!\n');
    console.log('Statistika:');
    console.log(`   Products:  ${stats.products.updated} yangilandi, ${stats.products.skipped} o'zgarishsiz`);
    console.log(`   Clients:   ${stats.clients.updated} yangilandi, ${stats.clients.skipped} o'zgarishsiz`);
    console.log(`   Debts:     ${stats.debts.updated} yangilandi, ${stats.debts.skipped} o'zgarishsiz`);
    console.log(`   Costs:     ${stats.costs.updated} yangilandi, ${stats.costs.skipped} o'zgarishsiz`);
    console.log(`   Sellers:   ${stats.sellers.updated} yangilandi, ${stats.sellers.skipped} o'zgarishsiz`);
    console.log(`   Payments:  ${stats.payments.updated} yangilandi, ${stats.payments.skipped} o'zgarishsiz`);
    console.log(`   Bot Users: ${stats.botUsers.updated} yangilandi, ${stats.botUsers.skipped} o'zgarishsiz`);
    console.log('\n✅ Baza yangi versiyaga moslashtirildi!');

    await mongoose.disconnect();
    console.log('\n👋 MongoDB dan uzildi');
}

// Script ishga tushirish
runMigration().catch(error => {
    console.error('❌ Migration xatosi:', error);
    process.exit(1);
});
