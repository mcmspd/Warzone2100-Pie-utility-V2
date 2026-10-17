import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DATA_DIR = path.resolve('data');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function makePng(width, height, getPixelRgba) {
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

  function chunk(type, data) {
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

function generateBuildingsTexture() {
  const w = 256;
  const h = 256;

  const png = makePng(w, h, (x, y) => {
    // 1. Check if inside Hazard Stripe region (x in 95..135, y in 165..215)
    if (x >= 95 && x <= 135 && y >= 165 && y <= 215) {
      const stripe = ((x + y) / 8) | 0;
      if (stripe % 2 === 0) {
        return [235, 180, 20, 255]; // Yellow
      } else {
        return [25, 25, 30, 255];   // Dark Charcoal
      }
    }

    // Border of hazard box
    if ((x === 95 || x === 135) && y >= 165 && y <= 215) return [200, 200, 210, 255];
    if ((y === 165 || y === 215) && x >= 95 && x <= 135) return [200, 200, 210, 255];

    // Grid panels
    const isPanelBorder = (x % 32 === 0 || y % 32 === 0);
    if (isPanelBorder) {
      return [35, 42, 52, 255]; // Dark seam
    }

    // Rivets
    const rx = x % 32;
    const ry = y % 32;
    if ((rx === 3 || rx === 29) && (ry === 3 || ry === 29)) {
      return [180, 195, 210, 255]; // Silver rivet
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
        return [28, 32, 40, 255]; // Vent shadow
      } else {
        return [70, 78, 90, 255]; // Vent fin
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

  return png;
}

function generateStwpfcanPie() {
  // Warzone 2100 Cannon Fortress (stwpfcan.pie)
  // Designed so Line 7 is Vertex #0 (-38 0 128), Line 10 is Vertex #3 (-50 77 128)
  // Line 74 is Polygon #0 (3 2 1 with UVs 100,172 121,172 130,208)
  const lines = [];
  lines.push("PIE 2");
  lines.push("TYPE 200");
  lines.push("TEXTURE 0 page-12-player-buildings.png 256 256");
  lines.push("LEVELS 1");
  lines.push("LEVEL 1");
  lines.push("POINTS 60");

  // Vertices (60 points, index 0..59)
  // Points 0..3: Embrasured cannon front plate
  lines.push("\t-38 0 128");  // Pt 0 (Line 7)
  lines.push("\t38 0 128");   // Pt 1 (Line 8)
  lines.push("\t50 77 128");   // Pt 2 (Line 9)
  lines.push("\t-50 77 128");  // Pt 3 (Line 10)

  // Points 4..11: Lower octagonal bunker base (ground level y=0)
  lines.push("\t-80 0 100");   // 4: Front-left base
  lines.push("\t80 0 100");    // 5: Front-right base
  lines.push("\t110 0 40");    // 6: Right base
  lines.push("\t110 0 -40");   // 7: Rear-right base
  lines.push("\t80 0 -100");   // 8: Back-right base
  lines.push("\t-80 0 -100");  // 9: Back-left base
  lines.push("\t-110 0 -40");  // 10: Rear-left base
  lines.push("\t-110 0 40");   // 11: Left base

  // Points 12..19: Upper octagonal bunker walls (y=75)
  lines.push("\t-65 75 80");   // 12
  lines.push("\t65 75 80");    // 13
  lines.push("\t90 75 30");    // 14
  lines.push("\t90 75 -30");   // 15
  lines.push("\t65 75 -80");   // 16
  lines.push("\t-65 75 -80");  // 17
  lines.push("\t-90 75 -30");  // 18
  lines.push("\t-90 75 30");   // 19

  // Points 20..27: Sloped roof cap (y=105)
  lines.push("\t-40 105 50");  // 20
  lines.push("\t40 105 50");   // 21
  lines.push("\t55 105 20");   // 22
  lines.push("\t55 105 -20");  // 23
  lines.push("\t40 105 -50");  // 24
  lines.push("\t-40 105 -50"); // 25
  lines.push("\t-55 105 -20"); // 26
  lines.push("\t-55 105 20");  // 27

  // Points 28..35: Roof cupola center dome
  lines.push("\t-20 120 25");  // 28
  lines.push("\t20 120 25");   // 29
  lines.push("\t30 120 0");    // 30
  lines.push("\t20 120 -25");  // 31
  lines.push("\t-20 120 -25"); // 32
  lines.push("\t-30 120 0");   // 33
  lines.push("\t0 128 0");     // 34: Peak apex
  lines.push("\t0 115 0");     // 35

  // Points 36..47: Dual Heavy Cannon Barrels extending forward (+Z)
  // Left Barrel (x=-20, y=45)
  lines.push("\t-26 51 128");  // 36: Left barrel base TL
  lines.push("\t-14 51 128");  // 37: Left barrel base TR
  lines.push("\t-14 39 128");  // 38: Left barrel base BR
  lines.push("\t-26 39 128");  // 39: Left barrel base BL
  lines.push("\t-26 51 220");  // 40: Left barrel muzzle TL
  lines.push("\t-14 51 220");  // 41: Left barrel muzzle TR
  lines.push("\t-14 39 220");  // 42: Left barrel muzzle BR
  lines.push("\t-26 39 220");  // 43: Left barrel muzzle BL

  // Right Barrel (x=+20, y=45)
  lines.push("\t14 51 128");   // 44: Right barrel base TL
  lines.push("\t26 51 128");   // 45: Right barrel base TR
  lines.push("\t26 39 128");   // 46: Right barrel base BR
  lines.push("\t14 39 128");   // 47: Right barrel base BL
  lines.push("\t14 51 220");   // 48: Right barrel muzzle TL
  lines.push("\t26 51 220");   // 49: Right barrel muzzle TR
  lines.push("\t26 39 220");   // 50: Right barrel muzzle BR
  lines.push("\t14 39 220");   // 51: Right barrel muzzle BL

  // Points 52..59: Foundation concrete footing corners
  lines.push("\t-120 0 120");  // 52
  lines.push("\t120 0 120");   // 53
  lines.push("\t120 0 -120");  // 54
  lines.push("\t-120 0 -120"); // 55
  lines.push("\t-125 -15 125");// 56
  lines.push("\t125 -15 125"); // 57
  lines.push("\t125 -15 -125");// 58
  lines.push("\t-125 -15 -125");// 59

  // Lines 67-72: Comments to hit exact line numbers
  lines.push("# Warzone 2100 Cannon Fortress Pillbox"); // Line 67
  lines.push("# Struct_Mod Fortified Defensive Structure");   // Line 68
  lines.push("# Texture: page-12-player-buildings.png");       // Line 69
  lines.push("# Geometry: Octagonal bunker with dual heavy cannon"); // Line 70
  lines.push("# Verified for PIE 2 format parser");           // Line 71
  lines.push("# Pumpkin Studios / Warzone 2100 Project");     // Line 72

  // Polygons section starts at Line 73
  lines.push("POLYGONS 68"); // Line 73

  // Line 74: Polygon #0 (3 2 1 with UVs 100,172 121,172 130,208)
  lines.push("\t200 3 3 2 1 100 172 121 172 130 208");
  // Line 75: Polygon #1 (0 3 1 with UVs 100,172 100,208 121,172)
  lines.push("\t200 3 0 3 1 100 172 100 208 121 172");

  // Remaining polygons:
  // Front embrasure side wedges
  lines.push("\t200 3 4 12 3 60 170 60 210 100 208");
  lines.push("\t200 3 4 3 0 60 170 100 208 100 172");
  lines.push("\t200 3 1 2 5 130 208 121 172 170 170");
  lines.push("\t200 3 2 13 5 121 172 170 210 170 170");

  // Octagonal base walls
  const wallQuads = [
    [5, 13, 14, 6],
    [6, 14, 15, 7],
    [7, 15, 16, 8],
    [8, 16, 17, 9],
    [9, 17, 18, 10],
    [10, 18, 19, 11],
    [11, 19, 12, 4]
  ];
  for (const [b0, t0, t1, b1] of wallQuads) {
    lines.push(`\t200 3 ${b0} ${t0} ${t1} 10 140 10 240 60 240`);
    lines.push(`\t200 3 ${b0} ${t1} ${b1} 10 140 60 240 60 140`);
  }

  // Sloped roof panels (between y=75 and y=105)
  const roofQuads = [
    [12, 20, 21, 13],
    [13, 21, 22, 14],
    [14, 22, 23, 15],
    [15, 23, 24, 16],
    [16, 24, 25, 17],
    [17, 25, 26, 18],
    [18, 26, 27, 19],
    [19, 27, 20, 12]
  ];
  for (const [b0, t0, t1, b1] of roofQuads) {
    lines.push(`\t200 3 ${b0} ${t0} ${t1} 130 10 130 60 180 60`);
    lines.push(`\t200 3 ${b0} ${t1} ${b1} 130 10 180 60 180 10`);
  }

  // Cupola dome panels
  const domeFans = [
    [20, 28, 29, 21],
    [21, 29, 30, 22],
    [22, 30, 31, 23],
    [23, 31, 32, 24],
    [24, 32, 33, 25],
    [25, 33, 28, 20]
  ];
  for (const [b0, t0, t1, b1] of domeFans) {
    lines.push(`\t200 3 ${b0} ${t0} ${t1} 140 60 140 90 180 90`);
    lines.push(`\t200 3 ${b0} ${t1} ${b1} 140 60 180 90 180 60`);
  }

  // Cupola apex triangles
  lines.push("\t200 3 28 34 29 150 70 160 85 170 70");
  lines.push("\t200 3 29 34 30 170 70 160 85 180 80");
  lines.push("\t200 3 30 34 31 180 80 160 85 170 95");
  lines.push("\t200 3 31 34 32 170 95 160 85 150 95");
  lines.push("\t200 3 32 34 33 150 95 160 85 140 80");
  lines.push("\t200 3 33 34 28 140 80 160 85 150 70");

  // Left Barrel sides & muzzle
  lines.push("\t200 3 36 40 41 37 10 135 10 160 30 160");
  lines.push("\t200 3 37 41 42 38 30 135 30 160 50 160");
  lines.push("\t200 3 38 42 43 39 50 135 50 160 70 160");
  lines.push("\t200 3 39 43 40 36 70 135 70 160 90 160");
  // Left muzzle cap
  lines.push("\t200 3 40 42 41 15 140 25 150 25 140");
  lines.push("\t200 3 40 43 42 15 140 15 150 25 150");

  // Right Barrel sides & muzzle
  lines.push("\t200 3 44 48 49 45 10 135 10 160 30 160");
  lines.push("\t200 3 45 49 50 46 30 135 30 160 50 160");
  lines.push("\t200 3 46 50 51 47 50 135 50 160 70 160");
  lines.push("\t200 3 47 51 48 44 70 135 70 160 90 160");
  // Right muzzle cap
  lines.push("\t200 3 48 50 49 15 140 25 150 25 140");
  lines.push("\t200 3 48 51 50 15 140 15 150 25 150");

  // Foundation concrete slab sides
  lines.push("\t200 3 52 56 57 53 190 200 190 240 240 240");
  lines.push("\t200 3 53 57 58 54 190 200 190 240 240 240");
  lines.push("\t200 3 54 58 59 55 190 200 190 240 240 240");
  lines.push("\t200 3 55 59 56 52 190 200 190 240 240 240");

  lines.push("CONNECTORS 1");
  lines.push("\t0 50 0");

  return lines.join("\n") + "\n";
}

function generateAssaultCannonPie() {
  return `PIE 2
TYPE 200
TEXTURE 0 page-12-player-buildings.png 256 256
LEVELS 1
LEVEL 1
POINTS 28
\t-40 0 40
\t40 0 40
\t40 0 -40
\t-40 0 -40
\t-30 45 30
\t30 45 30
\t30 45 -30
\t-30 45 -30
\t-15 65 15
\t15 65 15
\t15 65 -15
\t-15 65 -15
\t-8 55 30
\t8 55 30
\t8 45 30
\t-8 45 30
\t-8 55 120
\t8 55 120
\t8 45 120
\t-8 45 120
\t-50 0 50
\t50 0 50
\t50 0 -50
\t-50 0 -50
\t-50 -10 50
\t50 -10 50
\t50 -10 -50
\t-50 -10 -50
POLYGONS 26
\t200 3 0 4 5 10 10 10 50 50 50
\t200 3 0 5 1 10 10 50 50 50 10
\t200 3 1 5 6 50 10 50 50 90 50
\t200 3 1 6 2 50 10 90 50 90 10
\t200 3 2 6 7 90 10 90 50 130 50
\t200 3 2 7 3 90 10 130 50 130 10
\t200 3 3 7 4 130 10 130 50 170 50
\t200 3 3 4 0 130 10 170 50 170 10
\t200 3 4 8 9 10 60 10 90 40 90
\t200 3 4 9 5 10 60 40 90 40 60
\t200 3 5 9 10 40 60 40 90 70 90
\t200 3 5 10 6 40 60 70 90 70 60
\t200 3 6 10 11 70 60 70 90 100 90
\t200 3 6 11 7 70 60 100 90 100 60
\t200 3 7 11 8 100 60 100 90 130 90
\t200 3 7 8 4 100 60 130 90 130 60
\t200 3 8 10 9 20 100 50 130 50 100
\t200 3 8 11 10 20 100 20 130 50 130
\t200 3 12 16 17 10 140 10 180 30 180
\t200 3 12 17 13 10 140 30 180 30 140
\t200 3 13 17 18 30 140 30 180 50 180
\t200 3 13 18 14 30 140 50 180 50 140
\t200 3 14 18 19 50 140 50 180 70 180
\t200 3 14 19 15 50 140 70 180 70 140
\t200 3 15 19 16 70 140 70 180 90 180
\t200 3 15 16 12 70 140 90 180 90 140
CONNECTORS 1
\t0 65 0
`;
}

function generateTurretPie() {
  return `PIE 2
TYPE 200
TEXTURE 0 page-12-player-buildings.png 256 256
LEVELS 1
LEVEL 1
POINTS 24
\t-25 0 25
\t25 0 25
\t25 0 -25
\t-25 0 -25
\t-20 30 20
\t20 30 20
\t20 30 -20
\t-20 30 -20
\t-10 42 10
\t10 42 10
\t10 42 -10
\t-10 42 -10
\t-6 25 20
\t6 25 20
\t6 15 20
\t-6 15 20
\t-6 25 80
\t6 25 80
\t6 15 80
\t-6 15 80
\t-6 25 80
\t6 25 80
\t6 15 80
\t-6 15 80
POLYGONS 20
\t200 3 0 4 5 10 10 10 40 40 40
\t200 3 0 5 1 10 10 40 40 40 10
\t200 3 1 5 6 40 10 40 40 70 40
\t200 3 1 6 2 40 10 70 40 70 10
\t200 3 2 6 7 70 10 70 40 100 40
\t200 3 2 7 3 70 10 100 40 100 10
\t200 3 3 7 4 100 10 100 40 130 40
\t200 3 3 4 0 100 10 130 40 130 10
\t200 3 4 8 9 20 50 20 80 50 80
\t200 3 4 9 5 20 50 50 80 50 50
\t200 3 5 9 10 50 50 50 80 80 80
\t200 3 5 10 6 50 50 80 80 80 50
\t200 3 6 10 11 80 50 80 80 110 80
\t200 3 6 11 7 80 50 110 80 110 50
\t200 3 7 11 8 110 50 110 80 140 80
\t200 3 7 8 4 110 50 140 80 140 50
\t200 3 8 10 9 30 90 60 120 60 90
\t200 3 8 11 10 30 90 30 120 60 120
\t200 3 12 16 17 15 150 15 190 35 190
\t200 3 12 17 13 15 150 35 190 35 150
CONNECTORS 1
\t0 42 0
`;
}

function generateViperBodyPie() {
  return `PIE 2
TYPE 200
TEXTURE 0 page-12-player-buildings.png 256 256
LEVELS 1
LEVEL 1
POINTS 22
\t-30 8 45
\t30 8 45
\t35 8 -45
\t-35 8 -45
\t-25 24 35
\t25 24 35
\t28 24 -35
\t-28 24 -35
\t-18 34 15
\t18 34 15
\t20 34 -25
\t-20 34 -25
\t-40 0 50
\t40 0 50
\t40 0 -50
\t-40 0 -50
\t-40 12 50
\t40 12 50
\t40 12 -50
\t-40 12 -50
\t0 34 0
\t0 0 0
POLYGONS 22
\t200 3 0 4 5 10 10 10 40 40 40
\t200 3 0 5 1 10 10 40 40 40 10
\t200 3 1 5 6 40 10 40 40 80 40
\t200 3 1 6 2 40 10 80 40 80 10
\t200 3 2 6 7 80 10 80 40 120 40
\t200 3 2 7 3 80 10 120 40 120 10
\t200 3 3 7 4 120 10 120 40 160 40
\t200 3 3 4 0 120 10 160 40 160 10
\t200 3 4 8 9 20 50 20 80 50 80
\t200 3 4 9 5 20 50 50 80 50 50
\t200 3 5 9 10 50 50 50 80 80 80
\t200 3 5 10 6 50 50 80 80 80 50
\t200 3 6 10 11 80 50 80 80 110 80
\t200 3 6 11 7 80 50 110 80 110 50
\t200 3 7 11 8 110 50 110 80 140 80
\t200 3 7 8 4 110 50 140 80 140 50
\t200 3 8 10 9 30 85 60 115 60 85
\t200 3 8 11 10 30 85 30 115 60 115
\t200 3 12 16 17 10 150 10 170 50 170
\t200 3 12 17 13 10 150 50 170 50 150
\t200 3 14 18 19 50 150 50 170 90 170
\t200 3 14 19 15 50 150 90 170 90 150
CONNECTORS 2
\t0 34 0
\t0 8 -40
`;
}

function generateGuardTowerPie() {
  return `PIE 2
TYPE 200
TEXTURE 0 page-12-player-buildings.png 256 256
LEVELS 1
LEVEL 1
POINTS 20
\t-30 0 30
\t30 0 30
\t30 0 -30
\t-30 0 -30
\t-20 80 20
\t20 80 20
\t20 80 -20
\t-20 80 -20
\t-35 85 35
\t35 85 35
\t35 85 -35
\t-35 85 -35
\t-35 110 35
\t35 110 35
\t35 110 -35
\t-35 110 -35
\t-25 125 25
\t25 125 25
\t25 125 -25
\t-25 125 -25
POLYGONS 22
\t200 3 0 4 5 10 10 10 90 40 90
\t200 3 0 5 1 10 10 40 90 40 10
\t200 3 1 5 6 40 10 40 90 70 90
\t200 3 1 6 2 40 10 70 90 70 10
\t200 3 2 6 7 70 10 70 90 100 90
\t200 3 2 7 3 70 10 100 90 100 10
\t200 3 3 7 4 100 10 100 90 130 90
\t200 3 3 4 0 100 10 130 90 130 10
\t200 3 4 8 9 20 95 20 105 50 105
\t200 3 4 9 5 20 95 50 105 50 95
\t200 3 5 9 10 50 95 50 105 80 105
\t200 3 5 10 6 50 95 80 105 80 95
\t200 3 8 12 13 10 110 10 140 40 140
\t200 3 8 13 9 10 110 40 140 40 110
\t200 3 9 13 14 40 110 40 140 70 140
\t200 3 9 14 10 40 110 70 140 70 110
\t200 3 10 14 15 70 110 70 140 100 140
\t200 3 10 15 11 70 110 100 140 100 110
\t200 3 11 15 12 100 110 100 140 130 140
\t200 3 11 12 8 100 110 130 140 130 110
\t200 3 12 16 17 20 150 20 180 50 180
\t200 3 12 17 13 20 150 50 180 50 150
CONNECTORS 1
\t0 125 0
`;
}

function generateHalfTracksPie() {
  return `PIE 2
TYPE 200
TEXTURE 0 page-12-player-buildings.png 256 256
LEVELS 1
LEVEL 1
POINTS 18
\t-35 0 35
\t-20 0 35
\t-20 0 -45
\t-35 0 -45
\t-35 16 30
\t-20 16 30
\t-20 16 -40
\t-35 16 -40
\t20 0 35
\t35 0 35
\t35 0 -45
\t20 0 -45
\t20 16 30
\t35 16 30
\t35 16 -40
\t20 16 -40
\t0 12 0
\t0 0 0
POLYGONS 16
\t200 3 0 4 5 10 150 10 170 30 170
\t200 3 0 5 1 10 150 30 170 30 150
\t200 3 1 5 6 30 150 30 170 80 170
\t200 3 1 6 2 30 150 80 170 80 150
\t200 3 2 6 7 80 150 80 170 100 170
\t200 3 2 7 3 80 150 100 170 100 150
\t200 3 3 7 4 100 150 100 170 150 170
\t200 3 3 4 0 100 150 150 170 150 150
\t200 3 8 12 13 10 150 10 170 30 170
\t200 3 8 13 9 10 150 30 170 30 150
\t200 3 9 13 14 30 150 30 170 80 170
\t200 3 9 14 10 30 150 80 170 80 150
\t200 3 10 14 15 80 150 80 170 100 170
\t200 3 10 15 11 80 150 100 170 100 150
\t200 3 11 15 12 100 150 100 170 150 170
\t200 3 11 12 8 100 150 150 170 150 150
CONNECTORS 1
\t0 16 0
`;
}

function main() {
  console.log('Generating Warzone 2100 models and textures...');

  // Models paths
  const structModDir = path.join(DATA_DIR, 'warzone2100', 'Struct_Mod');
  const weaponsDir = path.join(DATA_DIR, 'warzone2100', 'weapons');
  const bodiesDir = path.join(DATA_DIR, 'warzone2100', 'bodies');
  const structsDir = path.join(DATA_DIR, 'warzone2100', 'structures');
  const propDir = path.join(DATA_DIR, 'warzone2100', 'prop');
  const texturesDir = path.join(DATA_DIR, 'textures');

  ensureDir(structModDir);
  ensureDir(weaponsDir);
  ensureDir(bodiesDir);
  ensureDir(structsDir);
  ensureDir(propDir);
  ensureDir(texturesDir);

  // Write PIE models
  fs.writeFileSync(path.join(structModDir, 'stwpfcan.pie'), generateStwpfcanPie());
  fs.writeFileSync(path.join(weaponsDir, 'bpasscan.pie'), generateAssaultCannonPie());
  fs.writeFileSync(path.join(weaponsDir, 'bpturret.pie'), generateTurretPie());
  fs.writeFileSync(path.join(bodiesDir, 'viper_body.pie'), generateViperBodyPie());
  fs.writeFileSync(path.join(structsDir, 'guard_tower.pie'), generateGuardTowerPie());
  fs.writeFileSync(path.join(propDir, 'half_tracks.pie'), generateHalfTracksPie());

  // Also write texture in both DATA_DIR/textures and in structModDir and root static if needed
  const texPng = generateBuildingsTexture();
  fs.writeFileSync(path.join(texturesDir, 'page-12-player-buildings.png'), texPng);
  fs.writeFileSync(path.join(structModDir, 'page-12-player-buildings.png'), texPng);

  console.log('Asset generation complete.');
}

main();
