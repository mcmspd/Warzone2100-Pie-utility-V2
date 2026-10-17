/**
 * Warzone 2100 Assembly Studio (dedicated /assemble page)
 * Browse data/mp/stats JSON files and assemble their PIEs the way the
 * Warzone 2100 engine does: base/body parts at origin, weapon mounts snapped
 * to connectors with yaw about Y, barrels chained off the mount's
 * connectors[0] with pitch about X.
 */

// Viewport X mirror (matches the engine's mirrored presentation).
const VIEW_X_FLIP = -1;
function toViewportX(x) {
  return x * VIEW_X_FLIP;
}

// Minimal local state (mirrors the shapes the engine code below expects)
const state = {
  allModels: [],
  assembly: {
    items: [],
    structId: null,
    selectedId: null
  }
};

const el = {};

let scene, camera, renderer, controls;
let assemblyRoot = null;
let assemblySeq = 0;

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function initAssemblyDom() {
  el.assemblyStep = document.getElementById('assembly-step');
  el.asmFileSelect = document.getElementById('asm-file-select');
  el.asmEntryFilter = document.getElementById('asm-entry-filter');
  el.asmEntries = document.getElementById('asm-entries');
  el.asmDetail = document.getElementById('asm-detail');
  el.asmDetailName = document.getElementById('asm-detail-name');
  el.asmJson = document.getElementById('asm-json');
  el.asmDetailPies = document.getElementById('asm-detail-pies');
  el.viewportStats = document.getElementById('asm-stats');
}

function initAssemblyScene() {
  const container = document.getElementById('asm-viewport');
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1117);

  camera = new THREE.PerspectiveCamera(45, width / height, 1, 8000);
  camera.position.set(320, 260, -380);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 60, 0);
  controls.update();

  const amb = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(amb);
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.85);
  dir1.position.set(200, 400, 300);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0x90b0e0, 0.4);
  dir2.position.set(-200, -100, -200);
  scene.add(dir2);

  assemblyRoot = new THREE.Group();
  assemblyRoot.name = 'AssemblyRoot';
  assemblyRoot.visible = true;
  scene.add(assemblyRoot);

  // Click (no drag) selects an assembly part
  let downPos = null;
  let downTime = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
    downTime = performance.now();
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    const dt = performance.now() - downTime;
    downPos = null;
    if (moved > 10 || dt > 600) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(assemblyRoot.children, true);
    if (hits.length > 0) {
      let o = hits[0].object;
      while (o && !o.userData.assemblyId) o = o.parent;
      if (o && o.userData.assemblyId) selectAssemblyPart(o.userData.assemblyId);
    }
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(container);
}

function fitAssemblyCamera() {
  if (!assemblyRoot || assemblyRoot.children.length === 0) return;
  const box = new THREE.Box3().setFromObject(assemblyRoot);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 20);
  controls.target.copy(center);
  camera.position.set(center.x + maxDim * 1.1, center.y + maxDim * 0.8, center.z - maxDim * 1.2);
  camera.lookAt(center);
  controls.update();
}

function initAssemblyEvents() {
  if (el.asmFileSelect) el.asmFileSelect.addEventListener('change', () => loadMpStatsFile(el.asmFileSelect.value));
  if (el.asmEntryFilter) el.asmEntryFilter.addEventListener('input', () => {
    const data = mpStatsCache[mpSelected.file] || {};
    renderMpEntries(mpSelected.file, data);
  });
  const clearTop = document.getElementById('btn-asm-clear-top');
  if (clearTop) clearTop.addEventListener('click', () => {
    asmBuildToken++;
    clearAssembly();
    showToast('Assembly cleared');
  });
  const fitBtn = document.getElementById('btn-asm-fit');
  if (fitBtn) fitBtn.addEventListener('click', () => fitAssemblyCamera());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      asmBuildToken++; // abort any in-flight auto-assembly
      clearAssembly();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initAssemblyDom();
  initAssemblyScene();
  initAssemblyEvents();
  loadMpStatsIndex();
});



/**
 * -------------------------------------------------------------
 * Assemble Mode Logic (engine-fashion multi-PIE assembly preview)
 * Mirrors the Warzone 2100 engine (display3d.cpp renderStructureTurrets,
 * component.cpp displayCompObj): base/body parts at origin, weapon mounts
 * snapped to connectors with yaw about Y, barrels chained off the mount's
 * connectors[0] with pitch about X. All math in PIE data space; viewport
 * X-mirror applied when positioning.
 * -------------------------------------------------------------
 */
let mpStatsCache = {}; // file -> { id -> record }
let mpSelected = { file: null, id: null }; // JSON viewer selection
let asmBuildToken = 0; // guards overlapping auto-assemblies from rapid clicks

function viewportConn(conn) {
  return { x: toViewportX(conn.x), y: conn.y, z: conn.z };
}

async function fetchAssemblyPie(piePath) {
  const res = await fetch(`/api/pie?path=${encodeURIComponent(piePath)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return { text, parsed: PieParser.parse(text), filename: piePath.split('/').pop() || 'model.pie' };
}

function loadAssemblyTexture(texName, piePath) {
  return new Promise((resolve) => {
    const texUrl = `/api/texture?name=${encodeURIComponent(texName || '')}&pie=${encodeURIComponent(piePath || '')}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.flipY = true;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestMipmapNearestFilter;
      tex.needsUpdate = true;
      resolve({ image: img, texture: tex });
    };
    img.onerror = () => resolve({ image: null, texture: null });
    img.src = texUrl;
  });
}

function resolvePartTextureName(parsed) {
  if (parsed.texture) return parsed.texture;
  if (parsed.textures && parsed.textures.length > 0) return parsed.textures[0].filename;
  return '';
}

function buildAssemblyPartGroup(pieData, texObj, opacity) {
  const group = new THREE.Group();
  const polys = pieData.polygons;
  const points = pieData.points;
  const positions = new Float32Array(polys.length * 3 * 3);
  const uvs = new Float32Array(polys.length * 3 * 2);

  for (let i = 0; i < polys.length; i++) {
    const poly = polys[i];
    const p0 = points[poly.points[0]];
    const p1 = points[poly.points[1]];
    const p2 = points[poly.points[2]];
    if (!p0 || !p1 || !p2) continue;

    const basePos = i * 9;
    positions[basePos + 0] = toViewportX(p0.x);
    positions[basePos + 1] = p0.y;
    positions[basePos + 2] = p0.z;

    positions[basePos + 3] = toViewportX(p2.x);
    positions[basePos + 4] = p2.y;
    positions[basePos + 5] = p2.z;

    positions[basePos + 6] = toViewportX(p1.x);
    positions[basePos + 7] = p1.y;
    positions[basePos + 8] = p1.z;

    const baseUV = i * 6;
    uvs[baseUV + 0] = poly.normUVs[0].u;
    uvs[baseUV + 1] = 1.0 - poly.normUVs[0].v;
    uvs[baseUV + 2] = poly.normUVs[2].u;
    uvs[baseUV + 3] = 1.0 - poly.normUVs[2].v;
    uvs[baseUV + 4] = poly.normUVs[1].u;
    uvs[baseUV + 5] = 1.0 - poly.normUVs[1].v;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();

  const hasMap = texObj && texObj.texture;
  const meshMat = new THREE.MeshStandardMaterial({
    map: hasMap ? texObj.texture : null,
    color: hasMap ? 0xffffff : 0x9fb3c8,
    transparent: true,
    opacity,
    roughness: 0.55,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 0.99
  });
  const mesh = new THREE.Mesh(geo, meshMat);
  mesh.userData.isPartMesh = true;
  group.add(mesh);

  group.userData.dispose = () => {
    geo.dispose();
    meshMat.map = null;
    meshMat.dispose();
    if (texObj && texObj.texture) texObj.texture.dispose();
  };
  return { group, mesh, meshMat };
}

async function loadAssemblyPart(piePath, opacity) {
  const { parsed, filename } = await fetchAssemblyPie(piePath);
  const texObj = await loadAssemblyTexture(resolvePartTextureName(parsed), piePath);
  const built = buildAssemblyPartGroup(parsed, texObj, opacity);
  return {
    key: 'p' + (++assemblySeq),
    label: filename, piePath, filename,
    pieData: parsed, texObj,
    group: built.group, mesh: built.mesh,
    meshMat: built.meshMat,
    opacity, visible: true
  };
}

function setAssemblyPartOpacity(part, opacity) {
  part.opacity = opacity;
  part.meshMat.opacity = opacity;
  part.meshMat.depthWrite = opacity >= 0.99;
  part.meshMat.needsUpdate = true;
}

// Engine order per turret: T(conn) * yawY * [mount] * T(mountConn0) * pitchX * recoil * [barrel]
// VTOL mounts add a 180-degree roll (order YZX) with inverted pitch.
async function buildWeaponTurret(res, parentGroup, parentPos, vtol) {
  const w = {
    id: 'w' + (++assemblySeq), kind: 'weapon',
    label: res.name, statId: res.id,
    yaw: 0, pitch: 0, recoil: 0, opacity: 1, visible: true, vtol: !!vtol,
    mount: null, barrel: null, muzzle: (res.pies && res.pies.muzzle) || null,
    slotParent: null, yawGroup: null, barrelGroup: null, barrelBasePos: { x: 0, y: 0, z: 0 }
  };
  const yawGroup = new THREE.Group();
  yawGroup.position.set(parentPos.x, parentPos.y, parentPos.z);
  parentGroup.add(yawGroup);
  w.yawGroup = yawGroup;

  let mountConn0 = null;
  if (res.resolved && res.resolved.mount) {
    const mp = await loadAssemblyPart(res.resolved.mount, w.opacity);
    mp.role = 'mount';
    yawGroup.add(mp.group);
    w.mount = mp;
    if (mp.pieData.connectors && mp.pieData.connectors.length > 0) {
      mountConn0 = viewportConn(mp.pieData.connectors[0]);
    }
  }

  const barrelGroup = new THREE.Group();
  const base = mountConn0 || { x: 0, y: 0, z: 0 };
  barrelGroup.position.set(base.x, base.y, base.z);
  yawGroup.add(barrelGroup);
  w.barrelGroup = barrelGroup;
  w.barrelBasePos = { x: base.x, y: base.y, z: base.z };

  if (res.resolved && res.resolved.barrel) {
    const bp = await loadAssemblyPart(res.resolved.barrel, w.opacity);
    bp.role = 'barrel';
    barrelGroup.add(bp.group);
    w.barrel = bp;
  }

  yawGroup.traverse(o => { o.userData.assemblyId = w.id; });
  return w;
}

function applyWeaponPose(w) {
  const D2R = Math.PI / 180;
  if (w.yawGroup) {
    if (w.vtol) {
      w.yawGroup.rotation.order = 'YZX';
      w.yawGroup.rotation.set(0, (w.yaw || 0) * D2R, Math.PI);
    } else {
      w.yawGroup.rotation.order = 'XYZ';
      w.yawGroup.rotation.set(0, (w.yaw || 0) * D2R, 0);
    }
  }
  if (w.barrelGroup) {
    // Engine pitches VTOL barrels down (-pitch) and ground barrels up (+pitch)
    w.barrelGroup.rotation.x = (w.vtol ? -1 : 1) * (w.pitch || 0) * D2R;
    const b = w.barrelBasePos || { x: 0, y: 0, z: 0 };
    w.barrelGroup.position.set(b.x, b.y, b.z + (w.recoil || 0));
  }
}

function disposeAssemblyGroup(group) {
  if (!group) return;
  if (group.userData.dispose) {
    try { group.userData.dispose(); } catch (e) { /* ignore */ }
  }
  group.traverse(o => {
    if (o === group) return;
    if (o.userData.dispose) {
      try { o.userData.dispose(); } catch (e) { /* ignore */ }
    } else {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    }
  });
}

function clearAssembly() {
  if (assemblyRoot) {
    while (assemblyRoot.children.length > 0) {
      const child = assemblyRoot.children[0];
      assemblyRoot.remove(child);
      disposeAssemblyGroup(child);
    }
  }
  state.assembly.items = [];
  state.assembly.structId = null;
  state.assembly.selectedId = null;
  refreshAssemblyPanel();
}

// Unified engine-fasion assembly: base PIEs at origin (+ slots from their
// connectors) with weapon turrets mounted weapon[i] -> slot[i + slotStart].
// VTOL (Lift propulsion) skips to connectors 5+ with inverted roll/pitch,
// exactly like displayCompObj in the engine.
async function assembleComposite(spec) {
  const bases = (spec.bases || []).filter(b => b && b.piePath);
  const weapons = spec.weapons || [];
  if (bases.length === 0 && !weapons.some(w => w.mountPath || w.barrelPath)) {
    showToast(`No local PIEs found for "${spec.label}".`);
    return;
  }
  const myToken = ++asmBuildToken;
  const alive = () => myToken === asmBuildToken;
  showToast(`Assembling: ${spec.label}…`);
  try {
    clearAssembly();
    if (!alive()) return;
    const asm = {
      id: 's' + (++assemblySeq), kind: spec.kind || 'structure',
      label: spec.label, statId: spec.statId || '',
      opacity: 1, visible: true, bases: [], slots: [], rootGroup: null
    };
    const rootGroup = new THREE.Group();
    rootGroup.userData.assemblyId = asm.id;
    assemblyRoot.add(rootGroup);
    asm.rootGroup = rootGroup;

    for (const b of bases) {
      if (!alive()) return;
      try {
        const part = await loadAssemblyPart(b.piePath, asm.opacity);
        if (!alive()) return;
        part.role = b.role || 'base';
        part.label = b.pieName || part.label;
        rootGroup.add(part.group);
        asm.bases.push(part);
        (part.pieData.connectors || []).forEach((conn, ci) => {
          const slotGroup = new THREE.Group();
          const vp = viewportConn(conn);
          slotGroup.position.set(vp.x, vp.y, vp.z);
          rootGroup.add(slotGroup);
          asm.slots.push({
            baseKey: part.key, index: ci,
            conn: { x: conn.x, y: conn.y, z: conn.z },
            attachedId: null, slotGroup
          });
        });
      } catch (err) {
        console.warn('Skipping base model', b.piePath, err);
      }
    }

    // Standalone weapon with no base: mount it at the origin.
    if (asm.bases.length === 0 && weapons.length > 0) {
      const def = weapons[0];
      if (def.mountPath || def.barrelPath) {
        const w = await buildWeaponTurret({
          name: def.name, id: def.id,
          pies: { mount: def.mountName, barrel: def.barrelName, muzzle: null },
          resolved: { mount: def.mountPath, barrel: def.barrelPath, muzzle: null }
        }, rootGroup, { x: 0, y: 0, z: 0 }, !!spec.vtol);
        if (!alive()) return;
        state.assembly.items.push(w);
        applyWeaponPose(w);
      }
    }

    if (asm.bases.length === 0 && state.assembly.items.length === 0) {
      showToast(`Could not load any models for "${spec.label}".`);
      clearAssembly();
      return;
    }

    if (asm.bases.length > 0) {
      state.assembly.items.push(asm);
      state.assembly.structId = asm.id;
      state.assembly.selectedId = asm.id;
    }

    // Mount weapons into slots (weapon i -> slot i, or 5+i for VTOL).
    const slotStart = spec.vtol ? 5 : 0;
    let mounted = 0;
    const defs = weapons.filter(d => d.mountPath || d.barrelPath);
    for (let wi = 0; wi < defs.length; wi++) {
      const si = slotStart + wi;
      const slot = asm.slots[si];
      const def = defs[wi];
      if (!slot || !def || slot.attachedId) continue;
      try {
        const w = await buildWeaponTurret({
          name: def.name, id: def.id,
          pies: { mount: def.mountName, barrel: def.barrelName, muzzle: null },
          resolved: { mount: def.mountPath, barrel: def.barrelPath, muzzle: null }
        }, slot.slotGroup, { x: 0, y: 0, z: 0 }, !!spec.vtol);
        if (!alive()) return;
        w.slotParent = { rootId: asm.id, slotIndex: si };
        slot.attachedId = w.id;
        state.assembly.items.push(w);
        applyWeaponPose(w);
        mounted++;
      } catch (err) {
        console.warn(`Skipping weapon "${def.name}":`, err);
      }
    }

    if (state.assembly.items.length > 0 && !state.assembly.selectedId) {
      state.assembly.selectedId = state.assembly.items[0].id;
    }
    refreshAssemblyPanel();
    fitAssemblyCamera();
    if (el.viewportStats) {
      el.viewportStats.textContent = `Assemble Mode: ${spec.label} — ${asm.slots.length} mount slot${asm.slots.length === 1 ? '' : 's'}`;
    }
    showToast(mounted > 0
      ? `Assembled ${spec.label} with ${mounted} weapon${mounted === 1 ? '' : 's'}`
      : `Assembled: ${spec.label} (${asm.slots.length} slots)`);
  } catch (err) {
    console.error('Assemble failed:', err);
    showToast('Failed to assemble: ' + err.message);
  }
}


function selectAssemblyPart(id) {
  state.assembly.selectedId = id;
  const item = state.assembly.items.find(a => a.id === id);
  if (item && el.viewportStats) {
    el.viewportStats.textContent = `Assemble Mode: selected ${item.label} (${item.kind})`;
  }
  refreshAssemblyPanel();
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- MP stats JSON viewer + local PIE resolution ----------
async function ensureAllModels() {
  if (state.allModels && state.allModels.length > 0) return state.allModels;
  try {
    const res = await fetch('/api/models');
    if (res.ok) {
      const data = await res.json();
      state.allModels = data.models || data || [];
    }
  } catch (err) {
    console.warn('Could not load model list:', err);
  }
  return state.allModels || [];
}

function resolveLocalPie(refName) {
  if (!refName) return null;
  const base = String(refName).split('/').pop().toLowerCase();
  const models = state.allModels || [];
  const hit = models.find(m => (m.filename || '').toLowerCase() === base)
    || models.find(m => ((m.piePath || m.path) || '').toLowerCase().endsWith('/' + base));
  return hit ? (hit.piePath || hit.path || null) : null;
}

async function loadMpStatsIndex() {
  try {
    const res = await fetch('/api/assembly/mpstats');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await ensureAllModels();
    if (el.asmFileSelect) {
      el.asmFileSelect.innerHTML = '';
      (data.files || []).forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.file;
        opt.textContent = `${f.file} (${f.entries})`;
        el.asmFileSelect.appendChild(opt);
      });
      const customs = customModelEntries();
      const copt = document.createElement('option');
      copt.value = '__custom__';
      copt.textContent = `Custom models (${customs.length})`;
      el.asmFileSelect.appendChild(copt);
      if (data.files && data.files.length > 0) {
        el.asmFileSelect.value = data.files[0].file;
        loadMpStatsFile(data.files[0].file);
      } else if (customs.length > 0) {
        el.asmFileSelect.value = '__custom__';
        loadMpStatsFile('__custom__');
      }
    }
  } catch (err) {
    console.error('Could not load MP stats index:', err);
    showToast('Could not load stats files: ' + err.message);
  }
}

// Local .pie files under data/custom, as viewer entries
function customModelEntries() {
  const models = state.allModels || [];
  return models
    .filter(m => ((m.piePath || m.path) || '').toLowerCase().startsWith('custom/'))
    .map(m => ({ id: m.filename, name: m.filename, piePath: m.piePath || m.path }));
}

function mpFileLabel(file) {
  return file === '__custom__' ? 'Custom models' : file;
}

async function ensureMpFile(file) {
  if (!mpStatsCache[file]) {
    const url = file.startsWith('custom/')
      ? `/api/assembly/mpstats/custom/${encodeURIComponent(file.slice('custom/'.length))}`
      : `/api/assembly/mpstats/${encodeURIComponent(file)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
    mpStatsCache[file] = await res.json();
  }
  return mpStatsCache[file];
}

// Look up a linked record, preferring same-source customs (custom/*.json)
// before falling back to the MP stats files.
async function lookupStats(kind, id) {
  const files = mpSelected.file.startsWith('custom/')
    ? [`custom/${kind}.json`, `${kind}.json`]
    : [`${kind}.json`];
  for (const f of files) {
    try {
      const data = await ensureMpFile(f);
      if (data && data[id]) return data[id];
    } catch { /* try next source */ }
  }
  return null;
}

async function loadMpStatsFile(file) {
  mpSelected = { file, id: null, plan: null };
  if (el.asmEntryFilter) el.asmEntryFilter.value = '';
  if (file === '__custom__') {
    const customs = customModelEntries();
    const data = {};
    customs.forEach(c => { data[c.id] = { name: c.name, piePath: c.piePath, custom: true }; });
    mpStatsCache[file] = data;
    renderMpEntries(file, data);
    if (el.asmDetail) el.asmDetail.style.display = 'none';
    return;
  }
  try {
    const data = await ensureMpFile(file);
    renderMpEntries(file, data);
    if (el.asmDetail) el.asmDetail.style.display = 'none';
  } catch (err) {
    console.error('Could not load stats file:', err);
    showToast('Could not load ' + file + ': ' + err.message);
  }
}

function renderMpEntries(file, data) {
  if (!el.asmEntries) return;
  const filter = (el.asmEntryFilter && el.asmEntryFilter.value || '').trim().toLowerCase();
  const ids = Object.keys(data).filter(k => !k.startsWith('_')).sort();
  const shown = filter
    ? ids.filter(id => ((data[id] || {}).name || id).toLowerCase().includes(filter) || id.toLowerCase().includes(filter))
    : ids;
  el.asmEntries.innerHTML = '';
  const frag = document.createDocumentFragment();
  shown.forEach((id) => {
    const rec = data[id] || {};
    const btn = document.createElement('button');
    btn.className = 'asm-entry-row' + (mpSelected.id === id ? ' asm-selected' : '');
    btn.innerHTML = `<span class="asm-row-label">${escHtml(rec.name || id)}</span><span class="asm-entry-id">${escHtml(id)}</span>`;
    btn.addEventListener('click', () => selectMpEntry(file, id));
    frag.appendChild(btn);
  });
  el.asmEntries.appendChild(frag);
  if (el.assemblyStep && !state.assembly.items.length) {
    el.assemblyStep.textContent = filter
      ? `${shown.length} of ${ids.length} entries match "${filter}"`
      : `${ids.length} entries in ${mpFileLabel(file)} — pick one to view`;
  }
}

async function selectMpEntry(file, id) {
  mpSelected = { file, id, plan: null };
  if (file === '__custom__') {
    selectCustomEntry(id);
    return;
  }
  const data = mpStatsCache[file] || {};
  renderMpEntries(file, data);
  const rec = data[id];
  if (!rec) return;
  if (el.asmDetail) el.asmDetail.style.display = 'block';
  if (el.asmDetailName) el.asmDetailName.textContent = `${rec.name || id} (${id})`;
  if (el.asmJson) el.asmJson.textContent = JSON.stringify(rec, null, 2);
  const plan = await buildMpAssemblyPlan(file, rec);
  mpSelected.plan = plan;
  if (el.asmDetailPies) {
    el.asmDetailPies.innerHTML = '';
    const frag = document.createDocumentFragment();
    const addChip = (pieName, piePath) => {
      const s = document.createElement('span');
      s.className = `asm-pie-chip ${piePath ? 'asm-pie-found' : 'asm-pie-missing'}`;
      s.title = `${pieName || '?'}${piePath ? '' : ' (not found locally)'}`;
      s.textContent = `${piePath ? '✓' : '✗'} ${String(pieName || '?').split('/').pop()}`;
      frag.appendChild(s);
    };
    plan.bases.forEach(b => addChip(b.pieName, b.piePath));
    plan.weapons.forEach(w => {
      addChip(w.mountName, w.mountPath);
      addChip(w.barrelName, w.barrelPath);
    });
    if (plan.bases.length === 0 && plan.weapons.length === 0) {
      const s = document.createElement('span');
      s.className = 'asm-pie-chip asm-pie-missing';
      s.textContent = 'no PIEs listed in this entry';
      frag.appendChild(s);
    }
    el.asmDetailPies.appendChild(frag);
  }
  if (plan.notes.length > 0) console.warn('Assembly notes:', plan.notes);
  const ready = plan.bases.some(b => b.piePath) || plan.weapons.some(w => w.mountPath || w.barrelPath);
  if (ready) {
    assembleMpEntry();
  } else {
    showToast('No listed PIEs found locally for this entry.');
  }
}

// Gather everything needed to assemble one stats entry:
// base PIEs at origin + weapon (mount/barrel) defs for the slots.
async function buildMpAssemblyPlan(file, rec) {
  await ensureAllModels();
  const plan = { label: rec.name || 'assembly', bases: [], weapons: [], vtol: false, notes: [] };
  const asPie = (ref) => ref ? { pieName: String(ref).split('/').pop(), piePath: resolveLocalPie(ref) } : null;
  const asWeapon = (wrec, wid) => {
    if (!wrec) {
      plan.notes.push(`weapon ${wid} not in weapons.json`);
      return;
    }
    const m = asPie(wrec.mountModel), b = asPie(wrec.model);
    plan.weapons.push({
      name: wrec.name || wid, id: wid,
      mountName: m && m.pieName, mountPath: m && m.piePath,
      barrelName: b && b.pieName, barrelPath: b && b.piePath,
      muzzleName: wrec.muzzleGfx ? String(wrec.muzzleGfx).split('/').pop() : null
    });
  };

  const base = (file.split('/').pop() || file).toLowerCase();

  if (base === 'weapons.json') {
    if (rec.mountModel || rec.model) {
      const m = asPie(rec.mountModel), b = asPie(rec.model);
      plan.weapons.push({
        name: rec.name || 'weapon',
        mountName: m && m.pieName, mountPath: m && m.piePath,
        barrelName: b && b.pieName, barrelPath: b && b.piePath,
        muzzleName: rec.muzzleGfx ? String(rec.muzzleGfx).split('/').pop() : null
      });
    }
  } else if (base === 'structure.json') {
    (Array.isArray(rec.structureModel) ? rec.structureModel : []).forEach(m => {
      const r = asPie(m);
      if (r) plan.bases.push(r);
    });
    for (const wid of (Array.isArray(rec.weapons) ? rec.weapons : [])) {
      asWeapon(await lookupStats('weapons', wid), wid);
    }
  } else if (base === 'templates.json') {
    try {
      const bodyRec = await lookupStats('body', rec.body);
      const propRec = await lookupStats('propulsion', rec.propulsion);
      if (bodyRec && bodyRec.model) {
        const r = asPie(bodyRec.model);
        if (r) plan.bases.push({ ...r, role: 'body' });
      } else {
        plan.notes.push(`body ${rec.body} has no linked model`);
      }
      if (propRec && propRec.model) {
        const r = asPie(propRec.model);
        if (r) plan.bases.push({ ...r, role: 'propulsion' });
      } else {
        plan.notes.push(`propulsion ${rec.propulsion} has no linked model`);
      }
      plan.vtol = !!propRec && propRec.type === 'Lift';
      for (const wid of (Array.isArray(rec.weapons) ? rec.weapons : [])) {
        asWeapon(await lookupStats('weapons', wid), wid);
      }
    } catch (err) {
      plan.notes.push('body/propulsion/weapons lookup failed: ' + err.message);
    }
  } else if (base === 'body.json' || base === 'propulsion.json') {
    if (rec.model) {
      const r = asPie(rec.model);
      if (r) plan.bases.push(r);
    }
  }
  return plan;
}

// Custom model entry: assemble the single PIE as a base (slots exposed,
// no stats-linked weapons).
async function selectCustomEntry(id) {
  const data = mpStatsCache['__custom__'] || {};
  renderMpEntries('__custom__', data);
  const rec = data[id];
  if (!rec) return;
  if (el.asmDetail) el.asmDetail.style.display = 'block';
  if (el.asmDetailName) el.asmDetailName.textContent = `${rec.name} (custom)`;
  try {
    const res = await fetch(`/api/pie?path=${encodeURIComponent(rec.piePath)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = PieParser.parse(await res.text());
    const info = {
      file: rec.piePath,
      points: parsed.points.length,
      polygons: parsed.polygons.length,
      connectors: parsed.connectors.length,
      texture: parsed.texture || null
    };
    if (el.asmJson) el.asmJson.textContent = JSON.stringify(info, null, 2);
    const plan = {
      label: rec.name,
      bases: [{ pieName: rec.name, piePath: rec.piePath }],
      weapons: [],
      vtol: false,
      notes: []
    };
    mpSelected.plan = plan;
    if (el.asmDetailPies) {
      el.asmDetailPies.innerHTML = '';
      const s = document.createElement('span');
      s.className = 'asm-pie-chip asm-pie-found';
      s.title = rec.piePath;
      s.textContent = `✓ ${rec.name}`;
      el.asmDetailPies.appendChild(s);
    }
    assembleMpEntry();
  } catch (err) {
    console.error('Could not load custom model:', err);
    showToast('Could not load custom model: ' + err.message);
  }
}

async function assembleMpEntry() {
  const plan = mpSelected.plan;
  if (!plan) {
    showToast('Pick a stats entry first.');
    return;
  }
  await assembleComposite({
    label: plan.label,
    statId: mpSelected.id,
    kind: (() => {
      const b = (mpSelected.file.split('/').pop() || '').toLowerCase();
      return b === 'templates.json' ? 'template' : (b === 'weapons.json' ? 'weaponset' : 'structure');
    })(),
    bases: plan.bases.filter(b => b.piePath),
    weapons: plan.weapons,
    vtol: plan.vtol
  });
  if (plan.notes.length > 0) {
    console.warn('Assembly notes:', plan.notes);
  }
}


function refreshAssemblyPanel() {
  const hasAny = state.assembly.items.length > 0;
  if (el.assemblyStep) {
    el.assemblyStep.textContent = !hasAny
      ? 'Pick a stats file and entry to view it assembled'
      : 'Click a part in 3D to select it';
  }
}
