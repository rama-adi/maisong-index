import type { MaimaiJsonSongInfo } from "@/contracts/arcade-song-info";
import { S3Client } from "bun";
import { Effect } from "effect";

const client = new S3Client({
  accessKeyId: process.env.R2_ACCESS_KEY || "",
  secretAccessKey: process.env.R2_SECRET || "",
  bucket: "otogesong-blob",
  endpoint: "https://855956162e3eb8bb45c380c65e365e39.r2.cloudflarestorage.com"
});

async function downloadAndUploadSong(song: MaimaiJsonSongInfo) {
    const imageUrl = `https://maimaidx.jp/maimai-mobile/img/Music/${song.image_url}`;
    
    try {
        // Fetch the image with TLS verification disabled
        const imageResponse = await fetch(imageUrl, {
            tls: {
                rejectUnauthorized: false
            }
        });
        if (!imageResponse.ok) {
            Effect.log(`Failed to fetch image for ${song.title}: ${imageResponse.statusText}`);
            return;
        }
        
        const imageBuffer = await imageResponse.arrayBuffer();
        
        // Upload to R2
        const file = client.file(`maimai/${song.image_url}`);
        
        await file.write(imageBuffer, {
            type: "image/png"
        });
        
        Effect.log(`Uploaded: ${song.title} -> maimai/${song.image_url}`);
    } catch (error) {
        Effect.log(`Error processing ${song.title}: ${error}`);
    }
}

async function main() {
    const response = await fetch("https://maimai.sega.jp/data/maimai_songs.json");
    const data = JSON.parse(await response.text()) as MaimaiJsonSongInfo[];

    // Process songs in batches of 10
    for (let i = 0; i < data.length; i += 10) {
        const batch = data.slice(i, i + 10);
        await Promise.all(batch.map(song => downloadAndUploadSong(song)));
    }
}

main();