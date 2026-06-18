/**
 * SmartDokon old_data Migration & Import Script
 * Eski JSON bazasini hozirgi Mongoose modellariga moslab import qilish uchun.
 *
 * Ishlatish: node scripts/import-old-data.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection URI
const MONGODB_URI = process.env.MONGO_URL || 'mongodb://localhost:27017/smartdokon';

console.log('🚀 SmartDokon old_data Import & Migration Script');
console.log('==================================================\n');

async function connectDB() {
    try {
        console.log(`Connecting to MongoDB at: ${MONGODB_URI.replace(/:([^:@]+)@/, ':***@')}`);
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB successfully.\n');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        process.exit(1);
    }
}

// Helper to recursively parse MongoDB Extended JSON format ($oid and $date)
function parseExtendedJson(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => parseExtendedJson(item));
    }

    // Convert $oid object to mongoose ObjectId instance
    if (obj.$oid && typeof obj.$oid === 'string') {
        return new mongoose.Types.ObjectId(obj.$oid);
    }

    // Convert $date object to JavaScript Date instance
    if (obj.$date) {
        if (typeof obj.$date === 'string') {
            return new Date(obj.$date);
        }
        if (typeof obj.$date === 'object' && obj.$date.$numberLong) {
            return new Date(parseInt(obj.$date.$numberLong, 10));
        }
        return new Date(obj.$date);
    }

    const newObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = parseExtendedJson(obj[key]);
        }
    }
    return newObj;
}

// Import config mapping file names to collection names and mapping adjusters
const filesToMigrate = [
    {
        filename: 'sellers.json',
        collectionName: 'sellers',
        adjuster: (doc) => {
            if (!doc.type) doc.type = 'sotuvchi';
            if (doc.refreshToken === undefined) doc.refreshToken = null;
            if (!doc.lastseen) doc.lastseen = new Date();
            if (!doc.permissions) doc.permissions = [];
            return doc;
        }
    },
    {
        filename: 'cashboxes.json',
        collectionName: 'cashboxes',
        adjuster: (doc) => {
            if (doc.cashBalance === undefined) doc.cashBalance = 0;
            if (doc.cardBalance === undefined) doc.cardBalance = 0;
            if (doc.bankBalance === undefined) doc.bankBalance = 0;
            if (!doc.transactions) doc.transactions = [];
            return doc;
        }
    },
    {
        filename: 'clients.json',
        collectionName: 'clients',
        adjuster: (doc) => {
            if (!doc.paymentHistory) doc.paymentHistory = [];
            if (doc.bonus === undefined) doc.bonus = 0;
            if (!doc.referralCode) {
                doc.referralCode = `REF${doc.phone || Date.now()}`;
            }
            if (!doc.debts) doc.debts = [];
            return doc;
        }
    },
    {
        filename: 'products.json',
        collectionName: 'products',
        adjuster: (doc) => {
            if (!doc.barcodes) {
                doc.barcodes = doc.barcode ? [doc.barcode] : [];
            }
            if (doc.minimumStock === undefined) doc.minimumStock = 0;
            if (!doc.unit) doc.unit = 'Dona';
            if (doc.totalPurchased === undefined) doc.totalPurchased = 0;
            if (doc.totalSold === undefined) doc.totalSold = 0;
            if (doc.lastSoldDate === undefined) doc.lastSoldDate = null;
            if (doc.lastPurchaseDate === undefined) doc.lastPurchaseDate = null;
            if (doc.lastPurchasePrice === undefined) doc.lastPurchasePrice = null;
            if (!doc.supplierProductCode) doc.supplierProductCode = '';
            if (!doc.supplierName) doc.supplierName = doc.sellername || '';
            return doc;
        }
    },
    {
        filename: 'handovers.json',
        collectionName: 'handovers',
        adjuster: (doc) => {
            if (!doc.status) doc.status = 'pending';
            return doc;
        }
    },
    {
        filename: 'payments.json',
        collectionName: 'payments',
        adjuster: (doc) => {
            if (doc.cash === undefined) doc.cash = 0;
            if (doc.terminal === undefined) doc.terminal = 0;
            if (doc.cashback === undefined) doc.cashback = 0;
            if (doc.rate === undefined) doc.rate = 0;
            if (doc.indebtedness === undefined) doc.indebtedness = 0;
            if (doc.profit === undefined) doc.profit = 0;
            if (!doc.date && doc.createdAt) {
                doc.date = doc.createdAt instanceof Date ? doc.createdAt.toISOString().split('T')[0] : String(doc.createdAt);
            }
            if (doc.products && Array.isArray(doc.products)) {
                doc.products.forEach(p => {
                    if (p.sellingPrice === undefined) p.sellingPrice = 0;
                    if (p.originalSellingPrice === undefined) p.originalSellingPrice = 0;
                    if (p.priceAdjustment === undefined) p.priceAdjustment = 0;
                    if (!p.unit) p.unit = 'piece';
                });
            }
            return doc;
        }
    },
    {
        filename: 'returneds.json',
        collectionName: 'returneds',
        adjuster: (doc) => {
            if (!doc.status) doc.status = 'yaroqli';
            return doc;
        }
    }
];

// Singletons to ensure exist in the database (from migration.js logic)
async function ensureSingletons() {
    console.log('⚙️ Ensuring required modern singletons/settings exist...');
    
    const botsettings = mongoose.connection.collection('botsettings');
    if ((await botsettings.countDocuments({})) === 0) {
        await botsettings.insertOne({
            botToken: '',
            clientBotToken: '',
            isAdminBotActive: false,
            isClientBotActive: false,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ BotSettings single item created.');
    }

    const checksettings = mongoose.connection.collection('checksettings');
    if ((await checksettings.countDocuments({})) === 0) {
        await checksettings.insertOne({
            brandName: 'Smart Dokon',
            logoUrl: '',
            qrUrl: '',
            headerText: 'Xaridingiz uchun rahmat!',
            footerText: "Keling, ko'rishamiz!",
            showDebt: true,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ CheckSettings single item created.');
    }

    const measurementunitsettings = mongoose.connection.collection('measurementunitsettings');
    if ((await measurementunitsettings.countDocuments({})) === 0) {
        await measurementunitsettings.insertOne({
            units: ['Dona', 'KG', 'Quti', 'Litr', 'Metr'],
            createdAt: new Date(),
            updatedAt: new Date()
        });
        console.log('   ✅ MeasurementUnitSettings single item created.');
    }
    console.log('');
}

async function runImport() {
    await connectDB();

    const oldDataDir = path.join(__dirname, '..', 'old_data');
    if (!fs.existsSync(oldDataDir)) {
        console.error(`❌ old_data directory not found at: ${oldDataDir}`);
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log('📥 Starting migration & importing files...\n');

    for (const task of filesToMigrate) {
        const filePath = path.join(oldDataDir, task.filename);
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ File ${task.filename} not found in 'old_data' directory, skipping.`);
            continue;
        }

        console.log(`📄 Processing file: ${task.filename} -> collection: ${task.collectionName}`);
        try {
            const rawContent = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(rawContent);

            if (!Array.isArray(jsonData)) {
                console.log(`❌ Data in ${task.filename} is not an array, skipping.`);
                continue;
            }

            console.log(`   Found ${jsonData.length} documents. Converting fields and types...`);
            const cleanedDocs = jsonData.map(doc => {
                const parsed = parseExtendedJson(doc);
                return task.adjuster(parsed);
            });

            const collection = mongoose.connection.collection(task.collectionName);
            
            // Clear current collection data to avoid unique index / duplicate _id issues
            console.log(`   Clearing existing documents in collection '${task.collectionName}'...`);
            await collection.deleteMany({});

            if (cleanedDocs.length > 0) {
                console.log(`   Inserting ${cleanedDocs.length} documents into '${task.collectionName}'...`);
                await collection.insertMany(cleanedDocs);
                console.log(`   ✅ Successfully imported '${task.collectionName}' collection.\n`);
            } else {
                console.log(`   ℹ️ No documents to insert for '${task.collectionName}'.\n`);
            }

        } catch (err) {
            console.error(`❌ Error importing ${task.filename}:`, err.message);
        }
    }

    // Create required modern singletons
    await ensureSingletons();

    console.log('==================================================');
    console.log('🎉 All available old_data files have been successfully migrated and imported.');
    console.log('==================================================');

    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB.');
}

runImport().catch(error => {
    console.error('❌ Migration process crashed:', error);
    process.exit(1);
});
