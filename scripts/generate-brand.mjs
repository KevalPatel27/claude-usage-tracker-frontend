// Reproducible raster exports of our vector brand artwork. No external services or data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const brand=path.join(root,'public/brand'),app=path.join(root,'app');
(async()=>{
 const source=fs.readFileSync(path.join(brand,'mark.svg'));
 for(const size of [192,512])await sharp(source).resize(size,size).png().toFile(path.join(brand,`app-${size}.png`));
 await sharp(source).resize(180,180).png().toFile(path.join(app,'apple-icon.png'));
 fs.writeFileSync(path.join(app,'icon.svg'),source);
 // Maskable artwork keeps all meaningful pixels inside the central 80% safe area.
 const mask=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#163447"/><image x="76" y="76" width="360" height="360" href="data:image/svg+xml;base64,${source.toString('base64')}"/></svg>`;
 await sharp(Buffer.from(mask)).png().toFile(path.join(brand,'maskable-512.png'));
 await sharp(fs.readFileSync(path.join(brand,'wordmark.svg'))).resize(708,128).png().toFile(path.join(brand,'wordmark.png'));
 await sharp(fs.readFileSync(path.join(brand,'preview.svg'))).png().toFile(path.join(app,'opengraph-image.png'));
 await sharp(fs.readFileSync(path.join(brand,'preview.svg'))).png().toFile(path.join(app,'twitter-image.png'));
 // ICO directory with PNG-encoded 16/32/48px images, supported by modern browsers.
 const sizes=[16,32,48],images=await Promise.all(sizes.map(s=>sharp(source).resize(s,s).png().toBuffer()));
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 images.forEach((bytes,i)=>{const entry=6+16*i;header[entry]=sizes[i];header[entry+1]=sizes[i];header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(bytes.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=bytes.length;});
 fs.writeFileSync(path.join(app,'favicon.ico'),Buffer.concat([header,...images]));
 console.log('Brand exports generated: favicon, app/touch icons, wordmark and 1200×630 preview images.');
})().catch(e=>{console.error(e);process.exitCode=1;});
