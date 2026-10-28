import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const STATIC_DIR = path.join(__dirname, 'static');
const DATA_DIR = path.join(__dirname, 'data');

// Ensure assets exist (supporting container sleep & ephemeral disk)
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function makePng(width: number, height: number, getPixelRgba: (x: number, y: number) => [number, number, number, number?]): Buffer {
  const lineSize = 1 + width * 4;
  const raw = Buffer.alloc(height * lineSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * lineSize;
    raw[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = getPixelRgba(x, y);
      const pxOffset = rowOffset + 1 + x * 4;
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }
  const compressed = zlib.deflateSync(raw);

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcVal = zlib.crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function generateBuildingsTexture(): Buffer {
  const w = 256;
  const h = 256;

  return makePng(w, h, (x, y) => {
    // 1. Hazard Stripe region (x in 95..135, y in 165..215)
    if (x >= 95 && x <= 135 && y >= 165 && y <= 215) {
      const stripe = ((x + y) / 8) | 0;
      if (stripe % 2 === 0) {
        return [235, 180, 20, 255];
      } else {
        return [25, 25, 30, 255];
      }
    }

    if ((x === 95 || x === 135) && y >= 165 && y <= 215) return [200, 200, 210, 255];
    if ((y === 165 || y === 215) && x >= 95 && x <= 135) return [200, 200, 210, 255];

    // Grid panels
    const isPanelBorder = (x % 32 === 0 || y % 32 === 0);
    if (isPanelBorder) {
      return [35, 42, 52, 255];
    }

    // Rivets
    const rx = x % 32;
    const ry = y % 32;
    if ((rx === 3 || rx === 29) && (ry === 3 || ry === 29)) {
      return [180, 195, 210, 255];
    }

    // Quadrant 1 (top-left): Military Green armor plates
    if (x < 128 && y < 128) {
      const noise = ((x * 13 + y * 29) % 17) - 8;
      const baseG = 85 + noise;
      return [60 + (noise >> 1), baseG, 50 + (noise >> 1), 255];
    }

    // Quadrant 2 (top-right): Dark mechanical cooling vents
    if (x >= 128 && y < 128) {
      const ventLine = (y % 6 < 3);
      if (ventLine) {
        return [28, 32, 40, 255];
      } else {
        return [70, 78, 90, 255];
      }
    }

    // Quadrant 3 (bottom-left): Gunmetal steel plating
    if (x < 128 && y >= 128) {
      const bevel = (rx < 4 || ry < 4) ? 25 : 0;
      const noise = ((x * 7 + y * 19) % 11) - 5;
      const val = Math.min(255, 95 + bevel + noise);
      return [val, val + 2, val + 6, 255];
    }

    // Quadrant 4 (bottom-right): Heavy concrete blast shield
    const noise = ((x * 31 + y * 47) % 23) - 11;
    const cVal = 130 + noise;
    return [cVal - 10, cVal - 5, cVal, 255];
  });
}

function generateStwpfcanPie(): string {
  const staticPie = path.join(STATIC_DIR, 'stwpfcan.pie');
  if (fs.existsSync(staticPie)) {
    return fs.readFileSync(staticPie, 'utf8');
  }
  return '';
}

function initAssetsIfNeeded() {
  const structModDir = path.join(DATA_DIR, 'warzone2100', 'Struct_Mod');
  const targetPie = path.join(structModDir, 'stwpfcan.pie');
  const targetTex = path.join(structModDir, 'page-12-player-buildings.png');
  const globalTexDir = path.join(DATA_DIR, 'textures');
  const staticTex = path.join(STATIC_DIR, 'page-12-player-buildings.png');

  ensureDir(structModDir);
  ensureDir(globalTexDir);

  const pieContent = generateStwpfcanPie();
  if (pieContent) {
    fs.writeFileSync(targetPie, pieContent);
  }

  let officialBuf: Buffer | null = null;
  if (fs.existsSync(staticTex)) {
    officialBuf = fs.readFileSync(staticTex);
  }

  if (!fs.existsSync(targetTex)) {
    fs.writeFileSync(targetTex, officialBuf || generateBuildingsTexture());
  }
  const globalTexPath = path.join(globalTexDir, 'page-12-player-buildings.png');
  if (!fs.existsSync(globalTexPath)) {
    fs.writeFileSync(globalTexPath, officialBuf || generateBuildingsTexture());
  }
}

initAssetsIfNeeded();

// Scan and index available models and textures
interface ModelInfo {
  id: string;
  name: string;
  filename: string;
  category: string;
  dir: string;
  piePath: string;
  path?: string;
  textures: Array<{ tileset: number; filename: string; width: number; height: number }>;
  defaultTexture: string;
  polyCount: number;
  pointCount: number;
  pieVersion: number;
  default: string;
  inGameName?: string;
  inGameType?: string;
  relatedItem?: string;
  relatedType?: string;
  relatedItems?: Array<{ name: string; type: string; id: string; role?: string }>;
}

let catalogCache: {
  pies: ModelInfo[];
  textures: string[];
} | null = null;

function loadCatalog(): { pies: ModelInfo[]; textures: string[] } {
  if (catalogCache) return catalogCache;
  const catalogPath = path.join(DATA_DIR, 'wz2100_catalog.json');
  if (fs.existsSync(catalogPath)) {
    try {
      catalogCache = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      return catalogCache!;
    } catch (e) {
      console.warn('Could not parse wz2100_catalog.json', e);
    }
  }
  return { pies: [], textures: [] };
}

// ---- MP assembly stats (data/mp/stats) for the JSON viewer + engine-fashion assembly ----
const MP_STATS_DIR = path.join(DATA_DIR, 'stats', 'mp');
const MP_STATS_FILES = ['weapons.json', 'structure.json', 'templates.json', 'body.json', 'propulsion.json'];

let mpStatsCache: Record<string, Record<string, any>> | null = null;

function loadMpStatsFile(file: string): Record<string, any> {
  if (!MP_STATS_FILES.includes(file)) return {};
  if (!mpStatsCache) mpStatsCache = {};
  if (!mpStatsCache[file]) {
    try {
      const full = path.join(MP_STATS_DIR, file);
      if (fs.existsSync(full)) {
        const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
        mpStatsCache[file] = (parsed && typeof parsed === 'object') ? parsed : {};
      } else {
        mpStatsCache[file] = {};
      }
    } catch (e) {
      console.warn(`Could not parse MP stats ${file}`, e);
      mpStatsCache[file] = {};
    }
  }
  return mpStatsCache[file];
}

function getAvailableModels(): ModelInfo[] {
  const models: ModelInfo[] = [];

  // Default Priority 1: Struct_Mod Cannon Fortress
  const defaultPath = 'warzone2100/Struct_Mod/stwpfcan.pie';
  const fullDefault = path.join(DATA_DIR, defaultPath);
  if (fs.existsSync(fullDefault)) {
    models.push({
      id: 'stwpfcan',
      name: 'stwpfcan.pie — [Structure] Cannon Fortress',
      filename: 'stwpfcan.pie',
      category: 'Struct_Mod',
      dir: 'warzone2100/Struct_Mod',
      piePath: defaultPath,
      textures: [{ tileset: 0, filename: 'page-12-player-buildings.png', width: 256, height: 256 }],
      defaultTexture: 'page-12-player-buildings.png',
      polyCount: 42,
      pointCount: 38,
      pieVersion: 2,
      default: 'true',
      inGameName: 'Cannon Fortress',
      inGameType: 'Structure',
      relatedItem: 'Cannon Fortress',
      relatedType: 'Structure',
      relatedItems: [{ name: 'Cannon Fortress', type: 'Structure', id: 'stwpfcan', role: 'Main Model' }]
    });
  }

  // Load indexed catalog from wz2100_catalog.json
  const catalog = loadCatalog();
  if (catalog.pies && catalog.pies.length > 0) {
    for (const p of catalog.pies) {
      const itemPath = p.path || p.piePath || '';
      if (itemPath === defaultPath || p.filename === 'stwpfcan.pie') continue;
      const relatedName = p.relatedItem || p.inGameName || '';
      const relatedType = p.relatedType || p.inGameType || '';
      const formattedName = relatedName
        ? `${p.filename} — [${relatedType}] ${relatedName}`
        : `${p.filename} (${p.category})`;

      models.push({
        id: path.parse(p.filename).name,
        name: formattedName,
        filename: p.filename,
        category: p.category || 'Other',
        dir: p.dir || '',
        piePath: itemPath,
        path: itemPath,
        textures: p.textures || [{ tileset: 0, filename: p.defaultTexture || 'page-12-player-buildings.png', width: 256, height: 256 }],
        defaultTexture: p.defaultTexture || 'page-12-player-buildings.png',
        polyCount: p.polyCount || 0,
        pointCount: p.pointCount || 0,
        pieVersion: p.pieVersion || 2,
        default: 'false',
        inGameName: relatedName,
        inGameType: relatedType,
        relatedItem: relatedName,
        relatedType: relatedType,
        relatedItems: p.relatedItems || []
      });
    }
  } else {
  // Fallback: Scan DATA_DIR for local .pie files if catalog is missing
  function scan(dir: string, base: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const rel = path.join(base, ent.name);
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'cache') continue;
        scan(full, rel);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pie')) {
        if (rel === defaultPath) continue;
        const stem = path.parse(ent.name).name;
        let cat = 'Other';
        if (rel.includes('weapons')) cat = 'Weapons';
        else if (rel.includes('bodies')) cat = 'Droid Bodies';
        else if (rel.includes('prop')) cat = 'Propulsion';
        else if (rel.includes('struct')) cat = 'Structures';

        models.push({
          id: stem,
          name: `${ent.name} (${cat})`,
          filename: ent.name,
          category: cat,
          dir: base,
          piePath: rel.replace(/\\/g, '/'),
          textures: [{ tileset: 0, filename: 'page-12-player-buildings.png', width: 256, height: 256 }],
          defaultTexture: 'page-12-player-buildings.png',
          polyCount: 0,
          pointCount: 0,
          pieVersion: 2,
          default: 'false'
        });
      }
    }
  }

  scan(DATA_DIR, '');
  }

  // Always include user models from data/custom (synced catalog never covers them)
  const seenPaths = new Set(models.map(m => (m.piePath || (m as any).path || '').toLowerCase()));
  const scanCustom = (dir: string, base: string) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(base, ent.name).replace(/\\/g, '/');
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scanCustom(full, rel);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pie')) {
        if (seenPaths.has(rel.toLowerCase())) continue;
        seenPaths.add(rel.toLowerCase());
        let defaultTexture = 'page-12-player-buildings.png';
        try {
          for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/, 40)) {
            const tr = line.trim().split(/\s+/);
            if (tr[0].toUpperCase() === 'TEXTURE' && tr[2]) {
              defaultTexture = tr[2];
              break;
            }
          }
        } catch { /* keep default texture */ }
        const stem = path.parse(ent.name).name;
        models.push({
          id: stem,
          name: `${ent.name} (Custom)`,
          filename: ent.name,
          category: 'Custom',
          dir: base,
          piePath: rel,
          path: rel,
          textures: [{ tileset: 0, filename: defaultTexture, width: 256, height: 256 }],
          defaultTexture,
          polyCount: 0,
          pointCount: 0,
          pieVersion: 2,
          default: 'false'
        });
      }
    }
  };
  scanCustom(path.join(DATA_DIR, 'custom'), 'custom');
  return models;
}

// Find texture file buffer (local or fallback)
async function findTextureBuffer(texName: string, pieRel?: string): Promise<Buffer | null> {
  const cleanName = path.basename(texName).trim();
  const lowerName = cleanName.toLowerCase();

  // 1. Same directory as PIE file
  if (pieRel) {
    const pieDir = path.dirname(path.join(DATA_DIR, pieRel));
    const candidate = path.join(pieDir, cleanName);
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate);
    }
  }

  // 2. Look in data/textures (exact or case-insensitive)
  const texDir = path.join(DATA_DIR, 'textures');
  if (fs.existsSync(texDir)) {
    const direct = path.join(texDir, cleanName);
    if (fs.existsSync(direct)) {
      return fs.readFileSync(direct);
    }
    const entries = fs.readdirSync(texDir);
    for (const f of entries) {
      if (f.toLowerCase() === lowerName) {
        return fs.readFileSync(path.join(texDir, f));
      }
    }
  }

  // 3. Look in static directory
  const inStatic = path.join(STATIC_DIR, cleanName);
  if (fs.existsSync(inStatic)) {
    return fs.readFileSync(inStatic);
  }
  const staticEntries = fs.readdirSync(STATIC_DIR);
  for (const f of staticEntries) {
    if (f.toLowerCase() === lowerName) {
      return fs.readFileSync(path.join(STATIC_DIR, f));
    }
  }

  // 4. Try fetching from data-texpages repository on GitHub.
  // cleanName is basename'd above and must stay a plain .png filename.
  if (/^[A-Za-z0-9_.\-]+\.png$/i.test(cleanName)) {
    try {
      const url = `https://raw.githubusercontent.com/Warzone2100/data-texpages/master/${cleanName}`;
      const res = await fetch(url);
      if (res.ok) {
        const arrBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrBuf);
        ensureDir(texDir);
        fs.writeFileSync(path.join(texDir, cleanName), buf);
        return buf;
      }
    } catch (err: any) {
      console.warn('Could not fetch remote texture:', cleanName, err.message);
    }
  }

  // 5. Default fallback: generate buildings texture if requesting page-12
  if (lowerName.includes('page-12')) {
    return generateBuildingsTexture();
  }

  return null;
}

// Structured Tilesets Catalog
function getAvailableTilesets() {
  return {
    categories: [
      {
        name: 'Terrain & Bases (Arizona / Urban / Rockies)',
        description: 'Standard campaign and skirmish tileset textures matching map climates',
        tilesets: [
          { file: 'page-9-player-buildings-bases.png', name: 'Player Bases & Foundations (Arizona)', climate: 'Arizona', type: 'bases' },
          { file: 'page-9-player-buildings-bases-urban.png', name: 'Player Bases & Foundations (Urban)', climate: 'Urban', type: 'bases' },
          { file: 'page-9-player-buildings-bases-rockies.png', name: 'Player Bases & Foundations (Rockies)', climate: 'Rockies', type: 'bases' },
          { file: 'page-8-player-buildings-bases.png', name: 'Factory & Module Bases (Arizona)', climate: 'Arizona', type: 'factory_bases' },
          { file: 'page-8-player-buildings-bases-urban.png', name: 'Factory & Module Bases (Urban)', climate: 'Urban', type: 'factory_bases' },
          { file: 'page-8-player-buildings-bases-rockies.png', name: 'Factory & Module Bases (Rockies)', climate: 'Rockies', type: 'factory_bases' },
          { file: 'page-7-barbarians-arizona.png', name: 'Barbarians & Scavengers (Arizona)', climate: 'Arizona', type: 'scavenger_bases' },
          { file: 'page-7-barbarians-urban.png', name: 'Barbarians & Scavengers (Urban)', climate: 'Urban', type: 'scavenger_bases' },
          { file: 'page-7-barbarians-kevlar.png', name: 'Barbarians & Scavengers (Kevlar)', climate: 'Special', type: 'scavenger_bases' },
          { file: 'page-29-features-arizona.png', name: 'Environment Features & Rocks (Arizona)', climate: 'Arizona', type: 'features' },
          { file: 'page-31-features-urban.png', name: 'Environment Features & Rubble (Urban)', climate: 'Urban', type: 'features' },
          { file: 'page-30-features-rockies.png', name: 'Environment Features & Snow (Rockies)', climate: 'Rockies', type: 'features' }
        ]
      },
      {
        name: 'Player Buildings & Laboratories',
        description: 'Core structures, headquarters, factories, research, and defenses',
        tilesets: [
          { file: 'page-12-player-buildings.png', name: 'Player Core Structures (Heavy Armor)', type: 'buildings' },
          { file: 'page-11-player-buildings.png', name: 'Player Defenses, Towers & Radar', type: 'buildings' },
          { file: 'page-13-player-buildings.png', name: 'Player Walls & Perimeter Defenses', type: 'buildings' },
          { file: 'page-10-laboratories.png', name: 'Research Laboratories & Domes', type: 'labs' },
          { file: 'page-34-buildings.png', name: 'Civilian Outposts & Concrete Structures', type: 'buildings' }
        ]
      },
      {
        name: 'Droids, Chassis & Propulsion',
        description: 'Tanks, cyborgs, wheels, half-tracks, hovercraft, and VTOLs',
        tilesets: [
          { file: 'page-14-droid-hubs.png', name: 'Droid Hubs & Light/Medium Bodies', type: 'droids' },
          { file: 'page-15-droid-hubs.png', name: 'Droid Heavy Chassis & Transport', type: 'droids' },
          { file: 'page-16-droid-drives.png', name: 'Propulsion Wheels, Half-Tracks & Hover', type: 'propulsion' },
          { file: 'page-17-droid-weapons.png', name: 'Turrets, Cannons & Launchers', type: 'weapons' },
          { file: 'page-59-more-weapons.png', name: 'Advanced Energy Weapons & Ordnance', type: 'weapons' },
          { file: 'page-33-cyborgs.png', name: 'Cyborg Infantry Chassis & Weapons', type: 'cyborgs' },
          { file: 'page-32-soldier.png', name: 'Infantry Soldiers & Crew', type: 'infantry' }
        ]
      },
      {
        name: 'Nexus & The Collective Factions',
        description: 'High-tech enemy faction structures and advanced research bases',
        tilesets: [
          { file: 'page-110-lab-hq_nex.png', name: 'Nexus HQ & Research Labs', type: 'nexus' },
          { file: 'page-111-player-buildings-nexus-bases.png', name: 'Nexus Base Foundations', type: 'nexus' },
          { file: 'page-112-player-buildings-nexus.png', name: 'Nexus Heavy Production', type: 'nexus' },
          { file: 'page-116-player-buildings_nex.png', name: 'Nexus Advanced Structures', type: 'nexus' },
          { file: 'page-117-player-buildings-bases_nex.png', name: 'Nexus Forward Outposts', type: 'nexus' },
          { file: 'page-118-laboratories_nex.png', name: 'Nexus High-Tech Labs', type: 'nexus' },
          { file: 'page-113-player-buildings-bases_Collective.png', name: 'Collective Forward Bases', type: 'collective' },
          { file: 'page-114-player-buildings_Collective.png', name: 'Collective Military Structures', type: 'collective' },
          { file: 'page-115-faction-bunkers.png', name: 'Hardened Faction Bunkers', type: 'collective' },
          { file: 'page-120-player-buildings-bases_Collective.png', name: 'Collective Base Plates', type: 'collective' },
          { file: 'page-121-player-buildings_Collective.png', name: 'Collective Fortresses', type: 'collective' },
          { file: 'page-123-laboratories_Collective.png', name: 'Collective Research Centers', type: 'collective' }
        ]
      },
      {
        name: 'Scavengers, Vehicles & Aircraft',
        description: 'Post-apocalyptic civilian conversions, rotorcraft, and FX',
        tilesets: [
          { file: 'page-0-scav.png', name: 'Scavenger Core Chassis', type: 'scav' },
          { file: 'page-1-icevan.png', name: 'Scavenger Ice Cream Van', type: 'scav' },
          { file: 'page-2-crane.png', name: 'Scavenger Crane & Construction', type: 'scav' },
          { file: 'page-3-bababus.png', name: 'Scavenger Baba Bus & Buggy', type: 'scav' },
          { file: 'page-4-scav.png', name: 'Scavenger Outpost Hardware', type: 'scav' },
          { file: 'page-119-minor-faction-buildings.png', name: 'Minor Factions & Neutral Enclaves', type: 'scav' },
          { file: 'page-403-chopper.png', name: 'Scavenger Attack Chopper', type: 'aircraft' },
          { file: 'helirotor.png', name: 'Helicopter Rotor Blades', type: 'aircraft' },
          { file: 'page-50-chopperblades.png', name: 'VTOL Rotor Disc 1', type: 'aircraft' },
          { file: 'page-51-chopperblades.png', name: 'VTOL Rotor Disc 2', type: 'aircraft' },
          { file: 'page-18-fx.png', name: 'Muzzle Flash & Sparks FX', type: 'fx' },
          { file: 'page-20-fx.png', name: 'Explosions, Fire & Smoke FX', type: 'fx' },
          { file: 'page-28-naval.png', name: 'Naval Gunboat & Vessels', type: 'naval' }
        ]
      }
    ]
  };
}

// Synchronize catalog with live GitHub repository
let isSyncing = false;
let lastSyncedAt = new Date().toISOString();

async function syncWithGitHubRepo(): Promise<{ success: boolean; newPies: number; newTextures: number; totalPies: number; totalTextures: number; message: string }> {
  if (isSyncing) {
    return { success: false, newPies: 0, newTextures: 0, totalPies: catalogCache?.pies.length || 0, totalTextures: catalogCache?.textures.length || 0, message: 'Sync already in progress' };
  }

  isSyncing = true;
  console.log('[Sync] Checking live Warzone2100 repository for updates...');

  try {
    const catalog = loadCatalog();
    const existingPies = new Map(catalog.pies.map(p => [(p.path || p.piePath || ''), p]));
    const existingTex = new Set(catalog.textures || []);

    // 1. Fetch live master tree from Warzone2100/warzone2100
    const treeRes = await fetch('https://api.github.com/repos/Warzone2100/warzone2100/git/trees/master?recursive=1', {
      headers: { 'User-Agent': 'Warzone2100-PIE-Studio' }
    });

    let newPiesCount = 0;
    if (treeRes.ok) {
      const treeData: any = await treeRes.json();
      if (treeData && Array.isArray(treeData.tree)) {
        const repoPies = treeData.tree.filter((f: any) => typeof f.path === 'string' && f.path.startsWith('data/') && f.path.endsWith('.pie'));
        const cacheDir = path.join(DATA_DIR, 'cache', 'pies');
        ensureDir(cacheDir);

        for (const item of repoPies) {
          if (!existingPies.has(item.path)) {
            newPiesCount++;
            const parts = item.path.split('/');
            const filename = parts[parts.length - 1];
            const dir = parts.slice(0, -1).join('/');
            let category = 'Other';
            if (item.path.includes('/structs')) category = 'Structures';
            else if (item.path.includes('/components/bodies')) category = 'Droid Bodies';
            else if (item.path.includes('/components/weapons')) category = 'Weapons';
            else if (item.path.includes('/components/prop')) category = 'Propulsion';
            else if (item.path.includes('/features')) category = 'Features & Environment';
            else if (item.path.includes('/effects')) category = 'Effects & Particles';
            else if (item.path.includes('/misc')) category = 'Miscellaneous';
            else if (item.path.includes('/mp/')) category = 'Multiplayer';

            // Fetch and parse new PIE
            try {
              const rawRes = await fetch('https://raw.githubusercontent.com/Warzone2100/warzone2100/master/' + item.path);
              if (rawRes.ok) {
                const text = await rawRes.text();
                const localCacheFile = path.join(cacheDir, item.path.replace(/[\/\\]/g, '__'));
                fs.writeFileSync(localCacheFile, text, 'utf8');

                const textures: Array<{ tileset: number; filename: string; width: number; height: number }> = [];
                for (const line of text.split(/\r?\n/)) {
                  const tr = line.trim();
                  if (tr.startsWith('TEXTURE')) {
                    const p = tr.split(/\s+/);
                    if (p.length >= 3) {
                      textures.push({
                        tileset: parseInt(p[1], 10) || 0,
                        filename: p[2],
                        width: parseInt(p[3], 10) || 256,
                        height: parseInt(p[4], 10) || 256
                      });
                    }
                  }
                }

                let polyCount = 0;
                const polyM = text.match(/POLYGONS\s+(\d+)/i);
                if (polyM) polyCount = parseInt(polyM[1], 10);

                let ptCount = 0;
                const ptM = text.match(/POINTS\s+(\d+)/i);
                if (ptM) ptCount = parseInt(ptM[1], 10);

                let pieVer = 2;
                const vM = text.match(/^PIE\s+(\d+)/m);
                if (vM) pieVer = parseInt(vM[1], 10);

                const newModel: ModelInfo = {
                  id: path.parse(filename).name,
                  name: `${filename} (${category})`,
                  filename,
                  category,
                  dir,
                  piePath: item.path,
                  textures,
                  defaultTexture: textures.length > 0 ? textures[0].filename : 'page-12-player-buildings.png',
                  polyCount,
                  pointCount: ptCount,
                  pieVersion: pieVer,
                  default: 'false'
                };
                catalog.pies.push(newModel);
                existingPies.set(item.path, newModel);
              }
            } catch (err: any) {
              console.warn(`Could not fetch new PIE ${item.path}:`, err.message);
            }
          }
        }
      }
    }

    // 2. Fetch live master tree from Warzone2100/data-texpages
    let newTexCount = 0;
    const texTreeRes = await fetch('https://api.github.com/repos/Warzone2100/data-texpages/git/trees/master?recursive=1', {
      headers: { 'User-Agent': 'Warzone2100-PIE-Studio' }
    });

    if (texTreeRes.ok) {
      const texData: any = await texTreeRes.json();
      if (texData && Array.isArray(texData.tree)) {
        const repoTextures = texData.tree.filter((f: any) => typeof f.path === 'string' && f.path.endsWith('.png')).map((f: any) => f.path);
        for (const t of repoTextures) {
          if (!existingTex.has(t)) {
            newTexCount++;
            catalog.textures.push(t);
            existingTex.add(t);
          }
        }
      }
    }

    // 3. Refresh MP assembly stats snapshots (data/mp/stats JSON files)
    try {
      const mpStatsDir = path.join(DATA_DIR, 'stats', 'mp');
      ensureDir(mpStatsDir);
      for (const f of MP_STATS_FILES) {
        try {
          const r = await fetch(`https://raw.githubusercontent.com/Warzone2100/warzone2100/master/data/mp/stats/${f}`, {
            headers: { 'User-Agent': 'Warzone2100-PIE-Studio' }
          });
          if (r.ok) {
            fs.writeFileSync(path.join(mpStatsDir, f), await r.text(), 'utf8');
          }
        } catch (e: any) {
          console.warn(`[Sync] Could not refresh MP stats ${f}:`, e.message);
        }
      }
      mpStatsCache = null;
    } catch { /* non-fatal */ }

    lastSyncedAt = new Date().toISOString();
    catalogCache = catalog;
    fs.writeFileSync(path.join(DATA_DIR, 'wz2100_catalog.json'), JSON.stringify(catalog, null, 2), 'utf8');

    console.log(`[Sync] Complete. Total PIE models: ${catalog.pies.length} (+${newPiesCount} new), Textures: ${catalog.textures.length} (+${newTexCount} new)`);
    isSyncing = false;
    return {
      success: true,
      newPies: newPiesCount,
      newTextures: newTexCount,
      totalPies: catalog.pies.length,
      totalTextures: catalog.textures.length,
      message: `Successfully synced with Warzone2100 GitHub repo. ${newPiesCount} new models, ${newTexCount} new tilesets found.`
    };
  } catch (err: any) {
    isSyncing = false;
    console.error('[Sync] Error syncing with GitHub:', err);
    return {
      success: false,
      newPies: 0,
      newTextures: 0,
      totalPies: catalogCache?.pies.length || 0,
      totalTextures: catalogCache?.textures.length || 0,
      message: 'Failed to sync with GitHub: ' + err.message
    };
  }
}

// Create Express app
const app = express();

// CORS and Cache Headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

app.use(express.json({ limit: '5mb' }));

// API: List Available Models
app.get('/api/models', (_req: Request, res: Response) => {
  const list = getAvailableModels();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    models: list,
    total: list.length,
    lastSynced: lastSyncedAt
  });
});

// API: List Structured Tilesets & Textures
app.get('/api/tilesets', (_req: Request, res: Response) => {
  const tilesets = getAvailableTilesets();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    ...tilesets,
    lastSynced: lastSyncedAt
  });
});

// API: Sync Catalog with Live GitHub Repository
app.get('/api/sync', async (_req: Request, res: Response) => {
  const result = await syncWithGitHubRepo();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({ ...result, lastSynced: lastSyncedAt });
});

app.post('/api/sync', async (_req: Request, res: Response) => {
  const result = await syncWithGitHubRepo();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({ ...result, lastSynced: lastSyncedAt });
});

// API: List MP assembly stats files (data/mp/stats JSON viewer)
app.get('/api/assembly/mpstats', (_req: Request, res: Response) => {
  const files = MP_STATS_FILES.map(f => {
    const recs = loadMpStatsFile(f);
    const entries = Object.keys(recs).filter(k => !k.startsWith('_')).length;
    return { file: f, entries };
  });
  // Plus user JSON configs under data/custom (same shapes, local overrides)
  try {
    const customDir = path.join(DATA_DIR, 'custom');
    if (fs.existsSync(customDir)) {
      for (const ent of fs.readdirSync(customDir)) {
        const full = path.join(customDir, ent);
        if (!ent.startsWith('.') && ent.toLowerCase().endsWith('.json') && fs.statSync(full).isFile()) {
          let entries = 0;
          try {
            const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
            if (parsed && typeof parsed === 'object') {
              entries = Object.keys(parsed).filter(k => !k.startsWith('_')).length;
            }
          } catch { /* count stays 0 */ }
          files.push({ file: 'custom/' + ent, entries });
        }
      }
    }
  } catch { /* ignore */ }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({ files });
});

// API: Get one MP assembly stats file (full JSON, allowlisted)
app.get('/api/assembly/mpstats/:file', (req: Request, res: Response) => {
  const file = req.params.file as string;
  if (!MP_STATS_FILES.includes(file)) {
    res.status(404).json({ error: `Unknown stats file: ${file}` });
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(loadMpStatsFile(file));
});

// API: Get one user JSON config from data/custom (top level, .json only)
app.get('/api/assembly/mpstats/custom/:name', (req: Request, res: Response) => {
  const name = req.params.name as string;
  if (!/^[A-Za-z0-9_.-]+\.json$/i.test(name)) {
    res.status(404).json({ error: `Unknown stats file: ${name}` });
    return;
  }
  try {
    const full = path.join(DATA_DIR, 'custom', name);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.status(404).json({ error: `Custom stats file not found: ${name}` });
      return;
    }
    const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      res.status(400).json({ error: `${name} is not a JSON object` });
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(parsed);
  } catch (err: any) {
    res.status(400).json({ error: `Could not parse ${name}: ` + (err.message || err) });
  }
});


// API: Get PIE Model File
app.get('/api/pie', async (req: Request, res: Response) => {
  const pieRel = req.query.path as string;
  if (!pieRel) {
    res.status(400).send("Missing 'path' parameter");
    return;
  }

  // Containment + type check via the shared resolver (defense in depth:
  // only .pie files under DATA_DIR are servable here)
  const fullPath = fmResolve(pieRel);
  if (!fullPath || path.extname(fullPath).toLowerCase() !== '.pie') {
    res.status(400).send('Invalid path: only .pie files under data/ can be served');
    return;
  }
  const normalizedRel = fmRel(fullPath);

  // 1. Direct path in DATA_DIR
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(content);
      return;
    } catch (err: any) {
      res.status(500).send(err.message || 'Error reading PIE file');
      return;
    }
  }

  // 2. Check cache directory
  const cacheFile = path.join(DATA_DIR, 'cache', 'pies', normalizedRel.replace(/[\/\\]/g, '__'));
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).isFile()) {
    try {
      const content = fs.readFileSync(cacheFile, 'utf8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(content);
      return;
    } catch (err: any) {
      res.status(500).send(err.message || 'Error reading cached PIE file');
      return;
    }
  }

  // 3. Search in cache directory by filename
  const baseName = path.basename(pieRel);
  const cacheDir = path.join(DATA_DIR, 'cache', 'pies');
  if (fs.existsSync(cacheDir)) {
    const entries = fs.readdirSync(cacheDir);
    for (const ent of entries) {
      if (ent.toLowerCase().endsWith(baseName.toLowerCase())) {
        const found = path.join(cacheDir, ent);
        try {
          const content = fs.readFileSync(found, 'utf8');
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.send(content);
          return;
        } catch (e) {
          // continue
        }
      }
    }
  }

  // 4. Fetch live from GitHub repository (Warzone2100/warzone2100).
  // normalizedRel is fmResolve-contained and .pie-only; still, keep the
  // remote path to plain relative segments (no escapes, no scheme).
  if (!/(^|\/)\.\.(\/|$)/.test(normalizedRel) && /^[A-Za-z0-9_.\-\/]+\.pie$/i.test(normalizedRel)) {
  try {
    const remoteUrl = `https://raw.githubusercontent.com/Warzone2100/warzone2100/master/${normalizedRel}`;
    const remoteRes = await fetch(remoteUrl);
    if (remoteRes.ok) {
      const content = await remoteRes.text();
      ensureDir(cacheDir);
      fs.writeFileSync(cacheFile, content, 'utf8');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(content);
      return;
    }
  } catch (err: any) {
    console.warn('Could not fetch remote PIE:', normalizedRel, err.message);
  }
  }

  res.status(404);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(`File not found: ${pieRel}`);
});

// API: Get Texture File
app.get('/api/texture', async (req: Request, res: Response) => {
  const texName = (req.query.name as string) || '';
  const pieRel = (req.query.pie as string) || '';

  const buf = await findTextureBuffer(texName, pieRel);
  if (!buf) {
    res.status(404);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(`Texture '${texName}' not found`);
    return;
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', buf.length.toString());
  res.send(buf);
});

// Static files from /static
app.use(express.static(STATIC_DIR));

// Dedicated Assembly Studio page
app.get('/assemble', (_req: Request, res: Response) => {
  res.sendFile(path.join(STATIC_DIR, 'assemble.html'));
});

// Dedicated File Manager page
app.get('/files', (_req: Request, res: Response) => {
  res.sendFile(path.join(STATIC_DIR, 'files.html'));
});

// ---- File Manager API (browse/view everywhere under data/, mutate data/custom only) ----
const CUSTOM_DIR = path.join(DATA_DIR, 'custom');
const FM_EXTS = new Set(['.pie', '.json']);

// Resolve a user-supplied relative path inside DATA_DIR (null = traversal attempt)
function fmResolve(rel: string): string | null {
  const normalized = path.normalize(rel || '').replace(/^(\.\.[\/\\])+/, '');
  const full = path.resolve(DATA_DIR, normalized);
  if (full !== DATA_DIR && !full.startsWith(DATA_DIR + path.sep)) return null;
  return full;
}

function fmRel(full: string): string {
  return path.relative(DATA_DIR, full).replace(/\\/g, '/');
}

function fmIsCustom(full: string): boolean {
  return full === CUSTOM_DIR || full.startsWith(CUSTOM_DIR + path.sep);
}

// Browse: dirs + .pie/.json files (read-only view of the whole tree)
app.get('/api/files/browse', (req: Request, res: Response) => {
  const full = fmResolve((req.query.path as string) || '');
  if (!full) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
    res.status(404).json({ error: 'Directory not found' });
    return;
  }
  try {
    const dirs: Array<{ name: string; path: string }> = [];
    const files: Array<{ name: string; path: string; size: number; mtime: string }> = [];
    for (const ent of fs.readdirSync(full, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const ef = path.join(full, ent.name);
      if (ent.isDirectory()) {
        dirs.push({ name: ent.name, path: fmRel(ef) });
      } else if (ent.isFile() && FM_EXTS.has(path.extname(ent.name).toLowerCase())) {
        const st = fs.statSync(ef);
        files.push({ name: ent.name, path: fmRel(ef), size: st.size, mtime: st.mtime.toISOString() });
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ path: fmRel(full), writable: fmIsCustom(full), dirs, files });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Browse failed' });
  }
});

// View file content (PIE/JSON, 2 MB cap)
app.get('/api/files/view', (req: Request, res: Response) => {
  const full = fmResolve((req.query.path as string) || '');
  if (!full) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  try {
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    if (!FM_EXTS.has(path.extname(full).toLowerCase())) {
      res.status(400).json({ error: 'Only .pie and .json files can be viewed' });
      return;
    }
    const st = fs.statSync(full);
    if (st.size > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'File too large to view' });
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ path: fmRel(full), writable: fmIsCustom(full), size: st.size, content: fs.readFileSync(full, 'utf8') });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Read failed' });
  }
});

// Save (create/overwrite) a .pie/.json file under data/custom only
app.post('/api/files/save', (req: Request, res: Response) => {
  const { path: rel, content, overwrite } = req.body || {};
  const full = fmResolve(typeof rel === 'string' ? rel : '');
  if (!full) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  if (!fmIsCustom(full)) {
    res.status(403).json({ error: 'Only files under data/custom can be saved' });
    return;
  }
  if (!FM_EXTS.has(path.extname(full).toLowerCase())) {
    res.status(400).json({ error: 'Only .pie and .json files can be saved' });
    return;
  }
  if (typeof content !== 'string' || content.length > 5 * 1024 * 1024) {
    res.status(400).json({ error: 'Missing or oversized content' });
    return;
  }
  try {
    if (fs.existsSync(full) && !overwrite) {
      res.status(409).json({ error: 'File exists (pass overwrite:true to replace)' });
      return;
    }
    ensureDir(path.dirname(full));
    fs.writeFileSync(full, content, 'utf8');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ ok: true, path: fmRel(full) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});

// Make a directory under data/custom only
app.post('/api/files/mkdir', (req: Request, res: Response) => {
  const { path: rel } = req.body || {};
  const full = fmResolve(typeof rel === 'string' ? rel : '');
  if (!full) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  if (!fmIsCustom(full) || full === CUSTOM_DIR) {
    res.status(403).json({ error: 'Directories can only be created under data/custom' });
    return;
  }
  try {
    ensureDir(full);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ ok: true, path: fmRel(full) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'mkdir failed' });
  }
});

// Delete a file (or directory tree with recursive:true) under data/custom only
app.delete('/api/files', (req: Request, res: Response) => {
  const rel = (req.query.path as string) || '';
  const recursive = (req.query.recursive as string) === 'true';
  const full = fmResolve(rel);
  if (!full) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  if (!fmIsCustom(full) || full === CUSTOM_DIR) {
    res.status(403).json({ error: 'Only files under data/custom can be deleted' });
    return;
  }
  try {
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (!recursive) {
        const entries = fs.readdirSync(full);
        if (entries.length > 0) {
          res.status(400).json({ error: 'Directory not empty (pass recursive:true)' });
          return;
        }
        fs.rmdirSync(full);
      } else {
        fs.rmSync(full, { recursive: true, force: true });
      }
    } else {
      fs.unlinkSync(full);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ ok: true, path: fmRel(full) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

// Fallback to static/index.html
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// Start Server
app.listen(PORT, HOST, () => {
  console.log(`Warzone 2100 PIE 3D Engine & UV Inspector running at http://${HOST}:${PORT}/`);
});
