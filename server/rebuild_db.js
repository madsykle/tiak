const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

async function run() {
  const client = new MongoClient("mongodb://localhost:27017");
  try {
    await client.connect();
    
    // 1. Drop ransomware db if it exists
    try {
        await client.db("READ_ME_TO_RECOVER_YOUR_DATA").dropDatabase();
        console.log("Dropped ransomware database.");
    } catch(e) {}
    
    const db = client.db("tiak");
    const jobs = db.collection("jobs");
    const users = db.collection("users");

    // 2. Ensure nesbeer user exists
    const userCount = await users.countDocuments({ username: "nesbeer" });
    if (userCount === 0) {
        await users.insertOne({
            _id: crypto.randomUUID(),
            username: "nesbeer",
            email: "nesbeer@localhost",
            password_hash: "admin", // They can change it
            role: "admin",
            default_preset_id: null
        });
        console.log("Re-seeded nesbeer admin user.");
    }
    
    // 3. Scan data directory and restore files
    const dataDir = path.join(__dirname, "data");
    const categories = fs.readdirSync(dataDir, { withFileTypes: true });
    
    let recoveredCount = 0;
    
    for (const dir of categories) {
        if (!dir.isDirectory() || dir.name.startsWith(".")) continue;
        
        const categoryPath = path.join(dataDir, dir.name);
        const files = fs.readdirSync(categoryPath);
        
        for (const file of files) {
            if (file.startsWith(".")) continue;
            
            const filePath = path.join(dir.name, file);
            
            // Check if job exists
            const existing = await jobs.findOne({ filename: filePath });
            if (!existing) {
                const stat = fs.statSync(path.join(dataDir, filePath));
                
                await jobs.insertOne({
                    _id: crypto.randomUUID(),
                    url: "recovered-from-disk",
                    status: "done",
                    progress: 100,
                    filename: filePath,
                    createdAt: Math.floor(stat.ctimeMs / 1000),
                    completedAt: Math.floor(stat.mtimeMs / 1000),
                    retries: 0,
                    category: dir.name,
                    platform: "unknown",
                    caption: file.replace(/\.[^/.]+$/, ""), // remove extension
                    creator_name: "unknown",
                    user_id: "nesbeer"
                });
                recoveredCount++;
            }
        }
    }
    
    console.log(`Successfully recovered ${recoveredCount} files into the database for user nesbeer!`);
  } catch (e) {
    console.error("Error during recovery:", e);
  } finally {
    await client.close();
  }
}

run();
