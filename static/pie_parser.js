/**
 * Warzone 2100 PIE File Parser
 * Supports PIE 2, PIE 3, and PIE 4 formats.
 * Preserves 1-based source line numbers for bidirectional highlighting.
 */

class PieParser {
  static parse(text) {
    const rawLines = text.split(/\r?\n/);
    const result = {
      version: 2,
      type: 0,
      texture: null,
      textureWidth: 256,
      textureHeight: 256,
      levelsCount: 1,
      levels: [],
      globalDirectives: {},
      points: [],        // Flattened or primary level points
      polygons: [],      // Flattened or primary level polygons
      connectors: [],    // Model connectors
      rawLines: rawLines,
      errors: [],
      lineMap: {}        // lineNum -> { type: 'poly'|'point'|'connector', index: number }
    };

    let currentSection = null;
    let expectedCount = 0;
    let currentLevel = null;

    for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
      const lineNum = lineIdx + 1;
      let line = rawLines[lineIdx];

      // Strip comment if present
      const commentIdx = line.indexOf('#');
      if (commentIdx !== -1) {
        line = line.substring(0, commentIdx);
      }
      const trimmed = line.trim();
      if (!trimmed) continue;

      const tokens = trimmed.split(/\s+/);
      const command = tokens[0].toUpperCase();

      // Check section header or directives
      if (command === 'PIE') {
        result.version = parseInt(tokens[1], 10) || 2;
        result.globalDirectives['PIE'] = result.version;
        currentSection = null;
        continue;
      }
      if (command === 'TYPE') {
        result.type = parseInt(tokens[1], 16) || 0;
        result.globalDirectives['TYPE'] = tokens[1];
        if (currentLevel) currentLevel.type = result.type;
        currentSection = null;
        continue;
      }
      if (command === 'TEXTURE') {
        // TEXTURE <tileset> <filename> [<width> <height>]
        const tileset = parseInt(tokens[1], 10) || 0;
        const filename = tokens[2] || '';
        let w = 256, h = 256;
        if (tokens.length >= 5) {
          w = parseInt(tokens[3], 10) || 256;
          h = parseInt(tokens[4], 10) || 256;
        }
        if (!result.textures) result.textures = [];
        if (!result.tilesetTextures) result.tilesetTextures = {};

        const texEntry = { tileset, filename, w, h, lineNum };
        result.textures.push(texEntry);
        result.tilesetTextures[tileset] = texEntry;

        if (!result.texture || tileset === 0) {
          result.texture = filename;
          result.textureWidth = w;
          result.textureHeight = h;
          result.selectedTileset = tileset;
        }
        result.globalDirectives['TEXTURE'] = { tileset, filename, w, h };
        if (currentLevel) currentLevel.texture = filename;
        currentSection = null;
        continue;
      }
      if (['TCMASK', 'NORMALMAP', 'SPECULARMAP', 'INTERPOLATE', 'EVENT'].includes(command)) {
        result.globalDirectives[command] = tokens.slice(1).join(' ');
        currentSection = null;
        continue;
      }
      if (command === 'LEVELS') {
        result.levelsCount = parseInt(tokens[1], 10) || 1;
        currentSection = null;
        continue;
      }
      if (command === 'LEVEL') {
        const levelIdx = parseInt(tokens[1], 10) || (result.levels.length + 1);
        currentLevel = {
          level: levelIdx,
          points: [],
          polygons: [],
          normals: [],
          connectors: [],
          texture: result.texture
        };
        result.levels.push(currentLevel);
        currentSection = null;
        continue;
      }
      if (command === 'POINTS') {
        expectedCount = parseInt(tokens[1], 10) || 0;
        currentSection = 'POINTS';
        if (!currentLevel) {
          currentLevel = { level: 1, points: [], polygons: [], normals: [], connectors: [], texture: result.texture };
          result.levels.push(currentLevel);
        }
        continue;
      }
      if (command === 'NORMALS') {
        expectedCount = parseInt(tokens[1], 10) || 0;
        currentSection = 'NORMALS';
        continue;
      }
      if (command === 'POLYGONS') {
        expectedCount = parseInt(tokens[1], 10) || 0;
        currentSection = 'POLYGONS';
        continue;
      }
      if (command === 'CONNECTORS') {
        expectedCount = parseInt(tokens[1], 10) || 0;
        currentSection = 'CONNECTORS';
        continue;
      }
      if (['ANIMOBJECT', 'SHADOWPOINTS', 'SHADOWPOLYGONS'].includes(command)) {
        currentSection = command;
        continue;
      }

      // Process section data lines
      if (currentSection === 'POINTS') {
        if (tokens.length >= 3) {
          const pt = {
            index: currentLevel.points.length,
            x: parseFloat(tokens[0]),
            y: parseFloat(tokens[1]),
            z: parseFloat(tokens[2]),
            lineNum: lineNum,
            polygons: [],
            uvReferences: []
          };
          currentLevel.points.push(pt);
          result.lineMap[lineNum] = { type: 'point', index: pt.index, level: currentLevel.level };
        }
      } else if (currentSection === 'NORMALS') {
        // 9 floats: 3 normals for 3 vertices of triangle
        const vals = tokens.map(parseFloat);
        if (vals.length >= 9) {
          currentLevel.normals.push({
            lineNum: lineNum,
            n0: [vals[0], vals[1], vals[2]],
            n1: [vals[3], vals[4], vals[5]],
            n2: [vals[6], vals[7], vals[8]]
          });
        }
      } else if (currentSection === 'POLYGONS') {
        // flags npoints p0 p1 p2 [anim] u0 v0 u1 v1 u2 v2
        const flags = parseInt(tokens[0], 16) || 0;
        const npoints = parseInt(tokens[1], 10) || 3;
        const pIndices = [];
        for (let i = 0; i < npoints; i++) {
          pIndices.push(parseInt(tokens[2 + i], 10));
        }

        let offset = 2 + npoints;
        let anim = null;
        if (flags & 0x4000) {
          anim = {
            frames: parseInt(tokens[offset], 10),
            playbackRate: parseInt(tokens[offset + 1], 10),
            width: parseFloat(tokens[offset + 2]),
            height: parseFloat(tokens[offset + 3])
          };
          offset += 4;
        }

        const rawUVs = [];
        const normUVs = [];
        const isPie2 = (result.version < 3);

        for (let i = 0; i < npoints; i++) {
          const uRaw = parseFloat(tokens[offset + i * 2]);
          const vRaw = parseFloat(tokens[offset + i * 2 + 1]);
          rawUVs.push({ u: uRaw, v: vRaw });

          // In PIE 2 coordinates are 0..256. In PIE 3/4 they are 0.0..1.0.
          // Also protect if coordinates in PIE 3/4 happen to be > 1.0:
          const isIntCoords = isPie2 || (Math.abs(uRaw) > 1.0 || Math.abs(vRaw) > 1.0);
          const divisor = isIntCoords ? 256.0 : 1.0;
          normUVs.push({
            u: uRaw / divisor,
            v: vRaw / divisor
          });
        }

        const poly = {
          index: currentLevel.polygons.length,
          globalIndex: result.polygons.length,
          flags: flags,
          npoints: npoints,
          points: pIndices,
          anim: anim,
          rawUVs: rawUVs,
          normUVs: normUVs,
          lineNum: lineNum,
          level: currentLevel.level
        };

        currentLevel.polygons.push(poly);
        result.polygons.push(poly);
        result.lineMap[lineNum] = { type: 'poly', index: poly.globalIndex, level: currentLevel.level };

        // Cross-reference points with polygons and UVs
        for (let i = 0; i < npoints; i++) {
          const ptIdx = pIndices[i];
          if (currentLevel.points && currentLevel.points[ptIdx]) {
            const pObj = currentLevel.points[ptIdx];
            if (!pObj.polygons.includes(poly.globalIndex)) {
              pObj.polygons.push(poly.globalIndex);
            }
            pObj.uvReferences.push({
              polyIndex: poly.globalIndex,
              vertexIdxInPoly: i,
              rawU: rawUVs[i].u,
              rawV: rawUVs[i].v,
              normU: normUVs[i].u,
              normV: normUVs[i].v,
              lineNum: poly.lineNum
            });
          }
        }

      } else if (currentSection === 'CONNECTORS') {
        if (tokens.length >= 3) {
          const cx = parseFloat(tokens[0]);
          const cy = parseFloat(tokens[1]);
          const cz = parseFloat(tokens[2]);
          // In Warzone PIE documentation:
          // In connectors, unlike points where Y is UP, Z denotes UP.
          // Position in 3D: X = cx, Y = cz, Z = -cy (or cy).
          const conn = {
            index: result.connectors.length,
            raw: [cx, cy, cz],
            x: cx,
            y: cz,   // Up
            z: cy,
            lineNum: lineNum
          };
          result.connectors.push(conn);
          if (currentLevel) currentLevel.connectors.push(conn);
          result.lineMap[lineNum] = { type: 'connector', index: conn.index };
        }
      }
    }

    // Default primary level points
    if (result.levels.length > 0) {
      result.points = result.levels[0].points;
    }

    return result;
  }

  /**
   * Update UV coordinates for a specific polygon by its line number or polygon match
   */
  static updatePolygonUVs(rawText, polyLineNum, newRawUVs, polyObj = null) {
    const lines = rawText.split(/\r?\n/);
    let lineIdx = -1;

    // 1. Try exact lineNum if it corresponds to a polygon
    if (polyLineNum >= 1 && polyLineNum <= lines.length) {
      const candLine = lines[polyLineNum - 1].trim();
      if (candLine && !candLine.startsWith('#')) {
        const t = candLine.split(/\s+/);
        if (t.length >= 5 && !['PIE', 'TYPE', 'TEXTURE', 'LEVELS', 'LEVEL', 'POINTS', 'NORMALS', 'POLYGONS', 'CONNECTORS', 'ANIMOBJECT'].includes(t[0].toUpperCase())) {
          lineIdx = polyLineNum - 1;
        }
      }
    }

    // 2. If lineIdx not found or mismatched, scan the POLYGONS section
    if (lineIdx === -1 && polyObj) {
      let inPolySection = false;
      let curPolyIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const tokens = trimmed.split(/\s+/);
        const cmd = tokens[0].toUpperCase();

        if (cmd === 'POLYGONS') {
          inPolySection = true;
          curPolyIdx = 0;
          continue;
        } else if (['CONNECTORS', 'ANIMOBJECT', 'SHADOWPOINTS', 'SHADOWPOLYGONS', 'LEVEL', 'POINTS', 'NORMALS', 'TYPE', 'TEXTURE'].includes(cmd)) {
          inPolySection = false;
        } else if (inPolySection) {
          if (polyObj.globalIndex !== undefined && curPolyIdx === polyObj.globalIndex) {
            lineIdx = i;
            break;
          }
          if (polyObj.points && tokens.length >= 2 + polyObj.points.length) {
            const np = parseInt(tokens[1], 10) || 3;
            if (np === polyObj.points.length) {
              let match = true;
              for (let p = 0; p < np; p++) {
                if (parseInt(tokens[2 + p], 10) !== polyObj.points[p]) {
                  match = false;
                  break;
                }
              }
              if (match) {
                lineIdx = i;
                break;
              }
            }
          }
          curPolyIdx++;
        }
      }
    }

    if (lineIdx === -1 || lineIdx >= lines.length) return rawText;

    let line = lines[lineIdx];
    let comment = '';
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) {
      comment = line.substring(commentIdx);
      line = line.substring(0, commentIdx);
    }

    const leadingWhitespaceMatch = line.match(/^(\s*)/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[1] : '\t';
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 5) return rawText;

    const flags = parseInt(tokens[0], 16) || 0;
    const npoints = parseInt(tokens[1], 10) || 3;
    let offset = 2 + npoints;
    if (flags & 0x4000) {
      offset += 4; // Skip animation parameters
    }

    // Build new tokens list
    const newTokens = tokens.slice(0, offset);
    for (let i = 0; i < npoints; i++) {
      if (newRawUVs && newRawUVs[i]) {
        const u = Number.isInteger(newRawUVs[i].u) ? newRawUVs[i].u : parseFloat(newRawUVs[i].u.toFixed(6));
        const v = Number.isInteger(newRawUVs[i].v) ? newRawUVs[i].v : parseFloat(newRawUVs[i].v.toFixed(6));
        newTokens.push(u.toString());
        newTokens.push(v.toString());
      } else if (offset + i * 2 + 1 < tokens.length) {
        newTokens.push(tokens[offset + i * 2]);
        newTokens.push(tokens[offset + i * 2 + 1]);
      }
    }

    let reconstructed = leadingWhitespace + newTokens.join(' ');
    if (comment) {
      reconstructed += ' ' + comment;
    }

    lines[lineIdx] = reconstructed;
    return lines.join('\n');
  }

  /**
   * Compute cross product normal and area for a triangle defined by points A, B, C
   */
  static computeTriangleNormal(pa, pb, pc) {
    if (!pa || !pb || !pc) {
      return { nx: 0, ny: 1, nz: 0, area: 0, isZeroArea: true };
    }
    const v1 = { x: pb.x - pa.x, y: pb.y - pa.y, z: pb.z - pa.z };
    const v2 = { x: pc.x - pa.x, y: pc.y - pa.y, z: pc.z - pa.z };

    const nx = v1.y * v2.z - v1.z * v2.y;
    const ny = v1.z * v2.x - v1.x * v2.z;
    const nz = v1.x * v2.y - v1.y * v2.x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

    return {
      nx: len > 1e-9 ? nx / len : 0,
      ny: len > 1e-9 ? ny / len : 0,
      nz: len > 1e-9 ? nz / len : 0,
      area: len / 2,
      isZeroArea: len < 1e-6
    };
  }

  /**
   * Fast Ray-Triangle Intersection (Möller–Trumbore algorithm)
   * Returns distance t if ray (orig, dir) intersects triangle (v0, v1, v2), else null.
   */
  static rayTriangleIntersect(orig, dir, v0, v1, v2) {
    const EPSILON = 1e-6;
    const e1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
    const e2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };

    const h = {
      x: dir.y * e2.z - dir.z * e2.y,
      y: dir.z * e2.x - dir.x * e2.z,
      z: dir.x * e2.y - dir.y * e2.x
    };

    const a = e1.x * h.x + e1.y * h.y + e1.z * h.z;
    if (a > -EPSILON && a < EPSILON) return null;

    const f = 1.0 / a;
    const s = { x: orig.x - v0.x, y: orig.y - v0.y, z: orig.z - v0.z };
    const u = f * (s.x * h.x + s.y * h.y + s.z * h.z);
    if (u < 0.0 || u > 1.0) return null;

    const q = {
      x: s.y * e1.z - s.z * e1.y,
      y: s.z * e1.x - s.x * e1.z,
      z: s.x * e1.y - s.y * e1.x
    };

    const v = f * (dir.x * q.x + dir.y * q.y + dir.z * q.z);
    if (v < 0.0 || u + v > 1.0) return null;

    const t = f * (e2.x * q.x + e2.y * q.y + e2.z * q.z);
    if (t > EPSILON) return t;
    return null;
  }

  /**
   * Update line in rawText with new vertex indices and UV coordinates for a polygon
   */
  static updatePolygonLineVerticesAndUVs(rawText, poly) {
    if (!poly || !poly.lineNum) return rawText;
    const lines = rawText.split(/\r?\n/);
    let lineIdx = poly.lineNum - 1;

    if (lineIdx < 0 || lineIdx >= lines.length) return rawText;

    let line = lines[lineIdx];
    let comment = '';
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) {
      comment = line.substring(commentIdx);
      line = line.substring(0, commentIdx);
    }

    const leadingWhitespaceMatch = line.match(/^(\s*)/);
    const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[1] : '\t';
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 5) return rawText;

    const flags = tokens[0];
    const npoints = parseInt(tokens[1], 10) || poly.points.length || 3;

    let animTokens = [];
    const flagVal = parseInt(flags, 16) || 0;
    if (flagVal & 0x4000) {
      animTokens = tokens.slice(2 + npoints, 2 + npoints + 4);
    }

    const newTokens = [flags, npoints.toString()];
    for (let i = 0; i < npoints; i++) {
      newTokens.push(poly.points[i].toString());
    }
    if (animTokens.length > 0) {
      newTokens.push(...animTokens);
    }
    for (let i = 0; i < npoints; i++) {
      if (poly.rawUVs && poly.rawUVs[i]) {
        const u = Number.isInteger(poly.rawUVs[i].u) ? poly.rawUVs[i].u : parseFloat(poly.rawUVs[i].u.toFixed(6));
        const v = Number.isInteger(poly.rawUVs[i].v) ? poly.rawUVs[i].v : parseFloat(poly.rawUVs[i].v.toFixed(6));
        newTokens.push(u.toString());
        newTokens.push(v.toString());
      }
    }

    let reconstructed = leadingWhitespace + newTokens.join(' ');
    if (comment) {
      reconstructed += ' ' + comment;
    }

    lines[lineIdx] = reconstructed;
    return lines.join('\n');
  }

  /**
   * Scan all polygons in pieData and correct ONLY genuinely inverted winding (swapping 2nd/3rd vertex & UVs)
   */
  static fixAllPolygonWindings(rawText, pieData) {
    if (!pieData || !pieData.polygons || !pieData.points) {
      return { updatedText: rawText, fixedCount: 0, zeroAreaCount: 0 };
    }

    const points = pieData.points;
    const polys = pieData.polygons;
    let fixedCount = 0;
    let zeroAreaCount = 0;
    let currentText = rawText;

    // Build geometry triangles list for ray testing
    const triangles = polys.map(poly => {
      if (!poly.points || poly.points.length < 3) return null;
      const pa = points[poly.points[0]];
      const pb = points[poly.points[1]];
      const pc = points[poly.points[2]];
      if (!pa || !pb || !pc) return null;

      const normInfo = PieParser.computeTriangleNormal(pa, pb, pc);
      return {
        poly,
        pa, pb, pc,
        normal: normInfo,
        center: {
          x: (pa.x + pb.x + pc.x) / 3,
          y: (pa.y + pb.y + pc.y) / 3,
          z: (pa.z + pb.z + pc.z) / 3
        }
      };
    }).filter(Boolean);

    triangles.forEach((tri, idx) => {
      if (tri.normal.isZeroArea) {
        zeroAreaCount++;
        return;
      }

      const { nx, ny, nz } = tri.normal;
      const center = tri.center;

      // Ray along +Normal (outward candidate)
      const rayOutOrig = {
        x: center.x + nx * 0.05,
        y: center.y + ny * 0.05,
        z: center.z + nz * 0.05
      };
      const rayOutDir = { x: nx, y: ny, z: nz };

      // Ray along -Normal (inward candidate)
      const rayInOrig = {
        x: center.x - nx * 0.05,
        y: center.y - ny * 0.05,
        z: center.z - nz * 0.05
      };
      const rayInDir = { x: -nx, y: -ny, z: -nz };

      let minTOut = Infinity;
      let minTIn = Infinity;

      for (let j = 0; j < triangles.length; j++) {
        if (j === idx) continue;
        const other = triangles[j];
        if (other.normal.isZeroArea) continue;

        const tOut = PieParser.rayTriangleIntersect(rayOutOrig, rayOutDir, other.pa, other.pb, other.pc);
        if (tOut !== null && tOut > 0.01 && tOut < minTOut) {
          minTOut = tOut;
        }

        const tIn = PieParser.rayTriangleIntersect(rayInOrig, rayInDir, other.pa, other.pb, other.pc);
        if (tIn !== null && tIn > 0.01 && tIn < minTIn) {
          minTIn = tIn;
        }
      }

      // ONLY flip if face normal points into interior room (minTOut < minTIn)
      const isInverted = (minTOut < minTIn && minTOut < Infinity);

      if (isInverted) {
        const poly = tri.poly;
        const p1Idx = poly.points[1];
        const p2Idx = poly.points[2];

        // Swap 2nd and 3rd vertex
        poly.points[1] = p2Idx;
        poly.points[2] = p1Idx;

        if (poly.rawUVs && poly.rawUVs.length >= 3) {
          const tmpRaw = poly.rawUVs[1];
          poly.rawUVs[1] = poly.rawUVs[2];
          poly.rawUVs[2] = tmpRaw;
        }

        if (poly.normUVs && poly.normUVs.length >= 3) {
          const tmpNorm = poly.normUVs[1];
          poly.normUVs[1] = poly.normUVs[2];
          poly.normUVs[2] = tmpNorm;
        }

        currentText = PieParser.updatePolygonLineVerticesAndUVs(currentText, poly);
        fixedCount++;
      }
    });

    return { updatedText: currentText, fixedCount, zeroAreaCount };
  }

  /**
   * Update or replace a TEXTURE directive in the PIE raw text.
   */
  static updateTexture(rawText, newTexFilename, tileset = 0) {
    const lines = rawText.split(/\r?\n/);
    let targetLineIdx = -1;
    let lastTextureIdx = -1;
    let typeLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const tokens = trimmed.split(/\s+/);
      const cmd = tokens[0].toUpperCase();

      if (cmd === 'TYPE') {
        typeLineIdx = i;
      } else if (cmd === 'TEXTURE') {
        lastTextureIdx = i;
        const curTileset = parseInt(tokens[1], 10) || 0;
        if (curTileset === tileset) {
          targetLineIdx = i;
          break;
        }
      }
    }

    if (targetLineIdx !== -1) {
      // Replace existing TEXTURE line while preserving dimensions/tokens if present
      const oldLine = lines[targetLineIdx];
      const match = oldLine.match(/^(\s*)/);
      const indent = match ? match[1] : '';
      const tokens = oldLine.trim().split(/\s+/);
      const w = tokens[3] || '256';
      const h = tokens[4] || '256';
      lines[targetLineIdx] = `${indent}TEXTURE ${tileset} ${newTexFilename} ${w} ${h}`;
    } else if (lastTextureIdx !== -1) {
      // Insert after last TEXTURE line
      lines.splice(lastTextureIdx + 1, 0, `TEXTURE ${tileset} ${newTexFilename} 256 256`);
    } else if (typeLineIdx !== -1) {
      // Insert after TYPE line
      lines.splice(typeLineIdx + 1, 0, `TEXTURE ${tileset} ${newTexFilename} 256 256`);
    } else {
      // Insert after first line
      lines.splice(1, 0, `TEXTURE ${tileset} ${newTexFilename} 256 256`);
    }

    return lines.join('\n');
  }

  /**
   * Add a new 3D point (vertex) into the PIE POINTS block and increment the POINTS count.
   */
  static addPoint(rawText, x, y, z) {
    const lines = rawText.split(/\r?\n/);
    let pointsHeaderIdx = -1;
    let pointsCount = 0;
    let insertIdx = -1;
    let pointIndent = '\t';

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      const tokens = trimmed.split(/\s+/);
      const cmd = tokens[0].toUpperCase();

      if (cmd === 'POINTS') {
        pointsHeaderIdx = i;
        pointsCount = parseInt(tokens[1], 10) || 0;
        insertIdx = i + 1;
      } else if (pointsHeaderIdx !== -1) {
        if (['POLYGONS', 'CONNECTORS', 'ANIMOBJECT', 'SHADOWPOINTS', 'SHADOWPOLYGONS', 'LEVEL', 'NORMALS'].includes(cmd)) {
          insertIdx = i;
          break;
        } else if (!trimmed.startsWith('#')) {
          // Detect indentation style from existing points
          const match = lines[i].match(/^(\s+)/);
          if (match) pointIndent = match[1];
          insertIdx = i + 1;
        }
      }
    }

    const roundOrFloat = (val) => {
      const rounded = Math.round(val);
      return Math.abs(val - rounded) < 0.0001 ? String(rounded) : parseFloat(val.toFixed(4)).toString();
    };

    const pointLine = `${pointIndent}${roundOrFloat(x)} ${roundOrFloat(y)} ${roundOrFloat(z)}`;

    if (pointsHeaderIdx === -1) {
      // Find where to insert POINTS section (e.g. before POLYGONS or after LEVEL)
      let levelIdx = -1;
      let polyIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const cmd = lines[i].trim().split(/\s+/)[0]?.toUpperCase();
        if (cmd === 'LEVEL') levelIdx = i;
        if (cmd === 'POLYGONS') { polyIdx = i; break; }
      }
      const targetPos = polyIdx !== -1 ? polyIdx : (levelIdx !== -1 ? levelIdx + 1 : lines.length);
      lines.splice(targetPos, 0, 'POINTS 1', pointLine);
      return {
        text: lines.join('\n'),
        pointIndex: 0,
        x, y, z
      };
    }

    // Update POINTS header count
    const headerLine = lines[pointsHeaderIdx];
    const headerTokens = headerLine.trim().split(/\s+/);
    const leadingMatch = headerLine.match(/^(\s*)/);
    const leading = leadingMatch ? leadingMatch[1] : '';
    lines[pointsHeaderIdx] = `${leading}${headerTokens[0]} ${pointsCount + 1}`;

    // Insert new point line
    lines.splice(insertIdx, 0, pointLine);

    return {
      text: lines.join('\n'),
      pointIndex: pointsCount,
      x, y, z
    };
  }

  /**
   * Add a new 3-point polygon to the PIE text
   */
  static addPolygon(rawText, p0, p1, p2, rawUVs = null, flags = '200', points = null) {
    const lines = rawText.split(/\r?\n/);
    let polyHeaderIdx = -1;
    let polyCount = 0;
    let insertIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const tokens = trimmed.split(/\s+/);
      if (tokens[0].toUpperCase() === 'POLYGONS') {
        polyHeaderIdx = i;
        polyCount = parseInt(tokens[1], 10) || 0;
        insertIdx = i + 1;
      } else if (polyHeaderIdx !== -1) {
        if (['CONNECTORS', 'ANIMOBJECT', 'SHADOWPOINTS', 'SHADOWPOLYGONS', 'LEVEL', 'POINTS', 'NORMALS'].includes(tokens[0].toUpperCase())) {
          insertIdx = i;
          break;
        } else if (trimmed && !trimmed.startsWith('#')) {
          insertIdx = i + 1;
        }
      }
    }

    if (polyHeaderIdx === -1) {
      lines.push('POLYGONS 1');
      polyHeaderIdx = lines.length - 1;
      insertIdx = lines.length;
      polyCount = 0;
    }

    // Default UVs if not provided
    const uvs = rawUVs || [
      { u: 50, v: 50 },
      { u: 150, v: 50 },
      { u: 100, v: 150 }
    ];

    // Check winding against model centroid if points provided
    if (points && points[p0] && points[p1] && points[p2]) {
      const pa = points[p0];
      const pb = points[p1];
      const pc = points[p2];

      const normInfo = PieParser.computeTriangleNormal(pa, pb, pc);
      if (normInfo.isZeroArea) {
        console.warn('Warning: Added triangle has zero area:', p0, p1, p2);
      } else {
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < points.length; i++) {
          cx += points[i].x;
          cy += points[i].y;
          cz += points[i].z;
        }
        cx /= points.length;
        cy /= points.length;
        cz /= points.length;

        const triCenterX = (pa.x + pb.x + pc.x) / 3;
        const triCenterY = (pa.y + pb.y + pc.y) / 3;
        const triCenterZ = (pa.z + pb.z + pc.z) / 3;

        let rx = triCenterX - cx;
        let ry = triCenterY - cy;
        let rz = triCenterZ - cz;
        const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (rLen > 1e-6) {
          rx /= rLen; ry /= rLen; rz /= rLen;
        } else {
          ry = 1;
        }

        const dot = normInfo.nx * rx + normInfo.ny * ry + normInfo.nz * rz;
        if (dot < 0) {
          // Inward normal! Swap p1 and p2, and swap uvs[1] and uvs[2]
          const tmpP = p1; p1 = p2; p2 = tmpP;
          if (uvs && uvs.length >= 3) {
            const tmpUv = uvs[1]; uvs[1] = uvs[2]; uvs[2] = tmpUv;
          }
        }
      }
    }

    // Update POLYGONS count header
    const headerLine = lines[polyHeaderIdx];
    const headerTokens = headerLine.trim().split(/\s+/);
    const leadingHeader = headerLine.match(/^(\s*)/)[1] || '';
    lines[polyHeaderIdx] = `${leadingHeader}${headerTokens[0]} ${polyCount + 1}`;

    const u0 = Number.isInteger(uvs[0].u) ? uvs[0].u : parseFloat(uvs[0].u.toFixed(6));
    const v0 = Number.isInteger(uvs[0].v) ? uvs[0].v : parseFloat(uvs[0].v.toFixed(6));
    const u1 = Number.isInteger(uvs[1].u) ? uvs[1].u : parseFloat(uvs[1].u.toFixed(6));
    const v1 = Number.isInteger(uvs[1].v) ? uvs[1].v : parseFloat(uvs[1].v.toFixed(6));
    const u2 = Number.isInteger(uvs[2].u) ? uvs[2].u : parseFloat(uvs[2].u.toFixed(6));
    const v2 = Number.isInteger(uvs[2].v) ? uvs[2].v : parseFloat(uvs[2].v.toFixed(6));

    const newLine = `\t${flags} 3 ${p0} ${p1} ${p2} ${u0} ${v0} ${u1} ${v1} ${u2} ${v2}`;
    lines.splice(insertIdx, 0, newLine);

    return lines.join('\n');
  }

  /**
   * Delete a polygon from the PIE text by its line number (or matching poly definition)
   * Also updates the POLYGONS count header accordingly
   */
  static deletePolygon(rawText, polyLineNum, polyObj = null) {
    const lines = rawText.split(/\r?\n/);
    let targetIdx = polyLineNum - 1;

    const isPolyLine = (idx) => {
      if (idx < 0 || idx >= lines.length) return false;
      const t = lines[idx].trim().split(/\s+/);
      if (t.length < 5) return false;
      const cmd = t[0].toUpperCase();
      if (['PIE', 'TYPE', 'TEXTURE', 'LEVELS', 'LEVEL', 'POINTS', 'NORMALS', 'POLYGONS', 'CONNECTORS', 'ANIMOBJECT'].includes(cmd)) return false;
      return true;
    };

    if (!isPolyLine(targetIdx)) {
      if (polyObj && polyObj.points) {
        for (let i = 0; i < lines.length; i++) {
          if (isPolyLine(i)) {
            const t = lines[i].trim().split(/\s+/);
            const np = parseInt(t[1], 10) || 3;
            if (np === polyObj.points.length) {
              let match = true;
              for (let p = 0; p < np; p++) {
                if (parseInt(t[2 + p], 10) !== polyObj.points[p]) {
                  match = false;
                  break;
                }
              }
              if (match) {
                targetIdx = i;
                break;
              }
            }
          }
        }
      }
    }

    if (targetIdx < 0 || targetIdx >= lines.length) return rawText;

    // Search backwards for the POLYGONS count header in this section
    let headerIdx = -1;
    for (let i = targetIdx; i >= 0; i--) {
      const trimmed = lines[i].trim();
      const tokens = trimmed.split(/\s+/);
      if (tokens[0] && tokens[0].toUpperCase() === 'POLYGONS') {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx !== -1) {
      const headerLine = lines[headerIdx];
      const headerTokens = headerLine.trim().split(/\s+/);
      const curCount = parseInt(headerTokens[1], 10) || 1;
      const newCount = Math.max(0, curCount - 1);
      const leadingMatch = headerLine.match(/^(\s*)/);
      const leading = leadingMatch ? leadingMatch[1] : '';
      lines[headerIdx] = `${leading}${headerTokens[0]} ${newCount}`;
    }

    // Remove the polygon line
    lines.splice(targetIdx, 1);
    return lines.join('\n');
  }

  /**
   * Delete a vertex (point) by index and line number.
   * Decrements POINTS header, removes the point line, removes any polygons referencing this vertex,
   * decrements POLYGONS header, and shifts point indices (> vertIndex -> -1) in remaining polygons.
   */
  static deleteVertex(rawText, vertIndex, vertLineNum) {
    const lines = rawText.split(/\r?\n/);
    const targetPointIdx = vertLineNum - 1;
    if (targetPointIdx < 0 || targetPointIdx >= lines.length) {
      return { text: rawText, deletedPolysCount: 0 };
    }

    // 1. Find POINTS header above this point
    let pointsHeaderIdx = -1;
    for (let i = targetPointIdx; i >= 0; i--) {
      const tokens = lines[i].trim().split(/\s+/);
      if (tokens[0] && tokens[0].toUpperCase() === 'POINTS') {
        pointsHeaderIdx = i;
        break;
      }
    }

    if (pointsHeaderIdx !== -1) {
      const headerLine = lines[pointsHeaderIdx];
      const headerTokens = headerLine.trim().split(/\s+/);
      const curCount = parseInt(headerTokens[1], 10) || 1;
      const newCount = Math.max(0, curCount - 1);
      const leadingMatch = headerLine.match(/^(\s*)/);
      const leading = leadingMatch ? leadingMatch[1] : '';
      lines[pointsHeaderIdx] = `${leading}${headerTokens[0]} ${newCount}`;
    }

    // 2. Scan and update POLYGONS section
    let polyHeaderIdx = -1;
    let deletedPolysCount = 0;
    const linesToDelete = new Set();
    linesToDelete.add(targetPointIdx);

    for (let i = 0; i < lines.length; i++) {
      if (i === targetPointIdx) continue;
      const originalLine = lines[i];
      let line = originalLine;
      let comment = '';
      const commentIdx = line.indexOf('#');
      if (commentIdx !== -1) {
        comment = line.substring(commentIdx);
        line = line.substring(0, commentIdx);
      }
      const trimmed = line.trim();
      if (!trimmed) continue;

      const tokens = trimmed.split(/\s+/);
      const command = tokens[0].toUpperCase();

      if (command === 'POLYGONS') {
        polyHeaderIdx = i;
        continue;
      }

      if (['CONNECTORS', 'ANIMOBJECT', 'SHADOWPOINTS', 'SHADOWPOLYGONS', 'LEVEL', 'POINTS', 'NORMALS'].includes(command)) {
        polyHeaderIdx = -1;
        continue;
      }

      if (polyHeaderIdx !== -1) {
        // We are inside POLYGONS section
        const flags = parseInt(tokens[0], 16) || 0;
        const npoints = parseInt(tokens[1], 10) || 3;
        if (tokens.length >= 2 + npoints) {
          const pIndices = [];
          let usesDeletedVertex = false;

          for (let p = 0; p < npoints; p++) {
            const pVal = parseInt(tokens[2 + p], 10);
            if (pVal === vertIndex) {
              usesDeletedVertex = true;
            }
            pIndices.push(pVal);
          }

          if (usesDeletedVertex) {
            linesToDelete.add(i);
            deletedPolysCount++;
          } else {
            // Shift indices greater than vertIndex down by 1
            let changed = false;
            for (let p = 0; p < npoints; p++) {
              if (pIndices[p] > vertIndex) {
                pIndices[p] -= 1;
                tokens[2 + p] = pIndices[p].toString();
                changed = true;
              }
            }

            if (changed) {
              const leadingMatch = originalLine.match(/^(\s*)/);
              const leading = leadingMatch ? leadingMatch[1] : '\t';
              let reconstructed = leading + tokens.join(' ');
              if (comment) {
                reconstructed += ' ' + comment;
              }
              lines[i] = reconstructed;
            }
          }
        }
      }
    }

    // Update POLYGONS count header if polygons were removed
    if (deletedPolysCount > 0 && polyHeaderIdx !== -1) {
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const tokens = trimmed.split(/\s+/);
        if (tokens[0] && tokens[0].toUpperCase() === 'POLYGONS') {
          const curCount = parseInt(tokens[1], 10) || deletedPolysCount;
          const newCount = Math.max(0, curCount - deletedPolysCount);
          const leadingMatch = lines[i].match(/^(\s*)/);
          const leading = leadingMatch ? leadingMatch[1] : '';
          lines[i] = `${leading}${tokens[0]} ${newCount}`;
          break;
        }
      }
    }

    // Filter out deleted lines
    const finalLines = lines.filter((_, idx) => !linesToDelete.has(idx));
    return {
      text: finalLines.join('\n'),
      deletedPolysCount: deletedPolysCount
    };
  }

  /**
   * Verify and correct POINTS, POLYGONS and CONNECTORS header counts.
   * Recounts the actual data rows in every section (per LEVEL) and rewrites
   * any header whose declared count differs. Blank lines and #-comments are
   * never counted. Header formatting (indentation, keyword case, trailing
   * comment) is preserved. Returns the fixed text plus a corrections list.
   */
  static fixSectionCounts(rawText) {
    const HEADER_COMMANDS = new Set([
      'PIE', 'TYPE', 'TEXTURE', 'TCMASK', 'NORMALMAP', 'SPECULARMAP',
      'INTERPOLATE', 'EVENT', 'LEVELS', 'LEVEL', 'POINTS', 'NORMALS',
      'POLYGONS', 'CONNECTORS', 'ANIMOBJECT', 'SHADOWPOINTS',
      'SHADOWPOLYGONS', 'MATERIALS', 'SHADERS'
    ]);
    const COUNTED_SECTIONS = new Set(['POINTS', 'POLYGONS', 'CONNECTORS']);

    const stripComment = (line) => {
      const idx = line.indexOf('#');
      return idx === -1 ? line : line.substring(0, idx);
    };
    const isDirective = (tokens) => tokens.length > 0 && HEADER_COMMANDS.has(tokens[0].toUpperCase());

    const lines = rawText.split(/\r?\n/);
    const corrections = [];

    for (let i = 0; i < lines.length; i++) {
      const code = stripComment(lines[i]).trim();
      if (!code) continue;
      const tokens = code.split(/\s+/);
      const cmd = tokens[0].toUpperCase();
      if (!COUNTED_SECTIONS.has(cmd)) continue;

      // Count data rows until the next directive header (scopes per LEVEL)
      let count = 0;
      for (let j = i + 1; j < lines.length; j++) {
        const rowCode = stripComment(lines[j]).trim();
        if (!rowCode) continue;
        const rowTokens = rowCode.split(/\s+/);
        if (isDirective(rowTokens)) break;
        // Mirror PieParser.parse acceptance: POINTS/CONNECTORS rows need
        // at least 3 tokens; POLYGONS rows are consumed as-is.
        if (cmd === 'POLYGONS' || rowTokens.length >= 3) {
          count++;
        }
      }

      const declared = parseInt(tokens[1], 10);
      if (!Number.isFinite(declared) || declared !== count) {
        const origLine = lines[i];
        const commentIdx = origLine.indexOf('#');
        const comment = commentIdx === -1 ? '' : origLine.substring(commentIdx);
        const leadingMatch = origLine.match(/^(\s*)/);
        const leading = leadingMatch ? leadingMatch[1] : '';
        const dirWord = code.split(/\s+/)[0]; // preserve original keyword case
        lines[i] = `${leading}${dirWord} ${count}` + (comment ? ' ' + comment : '');
        corrections.push({
          section: cmd,
          from: Number.isFinite(declared) ? declared : null,
          to: count,
          lineNum: i + 1
        });
      }
    }

    return { text: lines.join('\n'), corrections };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PieParser;
}

