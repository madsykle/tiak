const { MongoClient } = require("mongodb");
const { execSync } = require("child_process");

const uri = "mongodb://localhost:27017/tiak";
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const db = client.db("tiak");
        const jobs = db.collection("jobs");

        // Fetch jobs that have empty creator_name or platform is tiktok
        const cursor = jobs.find({ 
            $or: [
                { creator_name: "" },
                { creator_name: "unknown" }
            ]
        });
        const missingJobs = await cursor.toArray();

        for (const job of missingJobs) {
            if (!job.url) continue;
            
            console.log(`Fetching metadata for ${job.url}...`);
            try {
                const output = execSync(`./venv_python/bin/yt-dlp --dump-json --no-warnings ${job.url}`, { encoding: "utf-8" });
                const data = JSON.parse(output);
                const caption = data.description || data.title || job.caption;
                const creator_name = data.uploader || "unknown";
                
                await jobs.updateOne({ _id: job._id }, { $set: { caption, creator_name } });
                console.log(`Updated ${job.filename} successfully`);
            } catch (e) {
                console.log(`Failed for ${job.url}`);
            }
        }
        console.log("Backfill complete");
    } finally {
        await client.close();
    }
}
run();
