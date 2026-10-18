// Writes lib/assets.json: the photos in public/vendors and public/showcase.
// On Vercel, public/ is served from the CDN and is not inside the server function, so the server
// reads this list to know which shop and showcase photos exist. Runs as the build step
// (`npm run build`); run it yourself after adding photos if you deploy without a build.
import fs from "node:fs";

const IMG = /\.(jpe?g|png|webp)$/i;
const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => IMG.test(f)).sort() : []);
const out = { vendors: list("public/vendors"), showcase: list("public/showcase") };
fs.writeFileSync("lib/assets.json", JSON.stringify(out, null, 2) + "\n");
console.log(`lib/assets.json: ${out.vendors.length} vendor photos, ${out.showcase.length} showcase images`);
