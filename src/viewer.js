import { modelDigest } from "./browser-crypto.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import { reviewSurface, surfaceCost, SURFACE_ALGORITHM } from "./surface.js";
import { buildFillTopology, planarFaces } from "./planar-fill.js";
import { wholeFaces } from "./annotation-edits.js";
import { t } from "./i18n/index.js";

THREE.Mesh.prototype.raycast = acceleratedRaycast;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
const V = THREE.Vector3;
/* Coverage is stored as the clipped polygon; WebGL wants triangles. Fanning at
   draw time costs nothing and keeps the stored form free of the sixty-odd
   repetitions a stored fan carried. Three vertices fan to themselves.

   A fan is enough again because every polygon that can still reach here is
   convex: `source-v1` marks were clipped with half-planes, and `source-v2`
   stores whole faces as numbers and no polygons at all. Ear clipping arrived
   with the union of brush stamps, which is concave, and left with it. */
const fanInto = (coords, vertices) => {
  for (let i = 1; i < vertices.length - 1; i++)
    coords.push(...vertices[0], ...vertices[i], ...vertices[i + 1]);
};
// Matches the server's MAX_TRIANGLES; the review mesh is what has to fit.
const MAX_REVIEW_TRIANGLES = 600000;
/* Where the ground sits when nothing pushes it down. A model is fitted into
   three units and centred, so whichever axis is longest reaches ±1.5 — and a
   floor at -1.4 was cutting through the base of every model that stands
   taller than it is wide. The floor gives way to the model, never the other
   way round. */
const GRID_Y = -1.4;
/* STEP and STL say nothing about which way is up, so AI3D says it for them:
   +Z, with -Y towards the reviewer -- how CAD and every slicer draw them. glTF
   does say, +Y, and is left as it is. An agent whose model is built another way
   turns it before publishing; nothing here guesses. */
const Z_UP_FORMATS = new Set(["step", "stp", "stl"]);
/* How far off the pole a top or bottom view stands, in radians. Far enough
   from the 1e-6 OrbitControls clamps to, too little to see. */
const POLE_OFFSET = 1e-4;
// Let the browser actually paint before a long synchronous block starts. One
// animation frame only schedules the work; the second is what proves it ran.
// Off-screen callers — the geometry tests drive this same load path in Node —
// have nothing to paint, so they just need the turn of the event loop.
const nextPaint = () =>
  new Promise((resolve) =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => requestAnimationFrame(resolve))
      : setTimeout(resolve, 0),
  );
/* The one grey for a model that does not bring its own, and the one grey the
   plain view paints every model with. They were two constants that happened to
   agree until one of them was tuned, after which plain view came out brighter
   than the colours it was meant to be standing in for. One number now.

   The number itself only means anything next to the lamps: an albedo lands
   where the rig puts it, so this was solved against the rendered result a
   reviewer approved rather than picked for its own sake. The rails in
   `tests/browser/lighting.spec.js` hold that result, which is what makes the
   next change to the rig announce itself. */
const REVIEW_GREY = 0xcdd7dc;
const reviewGrey = () =>
  new THREE.MeshStandardMaterial({
    color: REVIEW_GREY,
    roughness: 0.6,
    metalness: 0.08,
  });
/* The plain view rewrites diffuse inside the shader, where colour is linear. */
const PLAIN_DIFFUSE = new THREE.Color(REVIEW_GREY)
  .toArray()
  .map((c) => c.toFixed(4))
  .join(",");
/* glTF says a primitive with no material takes "a default material", and the
   default it describes is a fully rough metal. A metal has no diffuse at all,
   so the hemisphere light — the only light under the model — cannot reach it,
   and every face pointing away from the two lamps overhead renders black.
   Exporters that write geometry and nothing else produce exactly that file.

   The question asked here is what the file declares, not what the material
   looks like once loaded: a model that really did ask for bare metal keeps it.
   `tests/browser/lighting.spec.js` publishes a file of each kind. */
const declaresNoMaterials = (data) => {
  const view = new DataView(data);
  if (view.byteLength < 20) return false;
  if (view.getUint32(0, true) !== 0x46546c67) return false; // "glTF"
  if (view.getUint32(16, true) !== 0x4e4f534a) return false; // "JSON"
  const length = view.getUint32(12, true);
  if (20 + length > view.byteLength) return false;
  try {
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(data, 20, length)),
    );
    return !json.materials?.length;
  } catch {
    return false; // Malformed here is the loader's error to report, not ours.
  }
};
export class ModelViewer {
  constructor(
    container,
    { onReady, onEdit, onPin, onPaint, onStrokeEnd, onError },
  ) {
    Object.assign(this, {
      container,
      onReady,
      onEdit,
      onPin,
      onPaint,
      onStrokeEnd,
      onError,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    this.camera.position.set(4, 3, 5);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* ACES is built for film, and its shoulder is doing the wrong job here: it
       rolls everything bright into a narrow band near white and takes the
       colour with it. A whole modelled scene came out with its canopy at 241
       and its walls at 228 — thirteen levels for the entire building. Nothing
       was clipping; the curve simply had no room left to separate anything.

       Khronos' PBR Neutral is the curve written for showing an object rather
       than for grading a frame. On that same scene it nearly doubles the tonal
       range the model occupies and doubles what is left of its colour. */
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.domElement.setAttribute("aria-label", t("a11y.viewer"));
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 18;
    /* The left button belongs to marking, in every mode. It used to be shared
       with the camera, which is why painting meant either holding Option to
       steal a rotation or switching tools to turn the model and switching back.
       Rotation moves to the right button, panning to the middle one. */
    this.controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    /* Directions and colours unchanged. The two lamps overhead come down hard
       and the sky barely moves, because they are not doing the same job: the
       lamps are what drove the lit faces into the top of the range, while the
       hemisphere is the only thing lighting a face that points away from them.
       Scaling all three together — the first thing tried — fixed the glare and
       halved every underside with it, which is the same mistake as 1.0.2 made
       in the other direction. */
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9ba8, 2.21));
    const key = new THREE.DirectionalLight(0xfff4dc, 1.39);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd3e3ff, 0.84);
    fill.position.set(-5, 3, -4);
    this.scene.add(fill);
    this.gridY = GRID_Y;
    this.applyTheme();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.overlay = new THREE.Group();
    this.scene.add(this.overlay);
    this.agentOverlay = new THREE.Group();
    this.previewOverlay = new THREE.Group();
    this.scene.add(this.agentOverlay, this.previewOverlay);
    this.annotationsVisible = true;
    this.fillTolerance = 6;
    // Two layers, because they are cleared on different schedules. Every pin
    // element is rebuilt whenever the marks change, so anything sharing that
    // layer is wiped by the very edit it is acknowledging — which is what
    // happened to the landing ripple: it was appended and then removed in the
    // same synchronous block, before a single frame could show it.
    this.effects = document.createElement("div");
    this.effects.className = "pin-layer";
    container.append(this.effects);
    this.labels = document.createElement("div");
    this.labels.className = "pin-layer";
    container.append(this.labels);
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;
    this.meshes = [];
    this.meshMap = new Map();
    this.pins = [];
    // Reused per frame: the pin layer used to allocate four vectors per pin.
    this.scratch = {
      world: new V(),
      projected: new V(),
      direction: new V(),
      orient: new V(),
    };
    this.occlusionAt = { position: new V(), target: new V() };
    this.occlusionValid = false;
    this.markMaterials = new Map();
    this.mode = "orbit";
    this.enabled = false;
    this.loadingEpoch = 0;
    this.pendingFrame = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => this.pointerDown(e), true);
    canvas.addEventListener("pointermove", (e) => this.pointerMove(e));
    canvas.addEventListener("pointercancel", () => this.pointerUp());
    window.addEventListener("pointerup", (e) => {
      this.clickEdit(e);
      this.pointerUp();
    });
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.enabled = false;
      this.onError(t("model.contextLost"));
    });
    canvas.addEventListener("wheel", (e) => this.wheel(e), {
      passive: false,
      capture: true,
    });
    this.renderer.setAnimationLoop(() => this.render());
  }
  /* Nothing here asks which device is turning the wheel, because that question
     has no reliable answer and asking it was the bug. A mouse and a trackpad
     are both `pointerType: "mouse"`, so the wheel was all there was to go on —
     and on macOS both go through the same scroll acceleration, where a mouse
     notch arrives small and fractional, indistinguishable from a trackpad
     glide. Every Mac was therefore read as a trackpad and had its wheel turned
     into a pan, on a laptop with a mouse plugged in no less.

     So the wheel means one thing on every device: zoom, which is what a wheel
     is for and what a two-finger glide does on every other page. Pan is Shift
     plus the same gesture, and stays on the middle button for anyone holding a
     mouse. Pinch keeps zooming for free — the browser reports it as a ctrl-held
     wheel, which OrbitControls already dollies.

     Handled in the capture phase so OrbitControls, which would otherwise dolly
     on every wheel event, never sees the ones that mean something else here. */
  wheel(e) {
    if (!this.enabled || !e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    /* Shift+wheel is the browser's horizontal-scroll convention, so a device
       with one axis has it delivered in `deltaX` on some platforms and `deltaY`
       on others. A pan is two-dimensional either way: move by whatever axes
       arrive and it follows the gesture on both. */
    this.panBy(e.deltaX, e.deltaY);
    this.render();
  }
  /* The same arithmetic OrbitControls uses for its own panning: screen pixels
     scaled by how much world the camera covers at the distance it is orbiting. */
  panBy(dx, dy) {
    const height = this.renderer.domElement.clientHeight || 1;
    const distance = this.camera.position.distanceTo(this.controls.target);
    const perPixel =
      (2 * distance * Math.tan(((this.camera.fov / 2) * Math.PI) / 180)) /
      height;
    const right = new V().setFromMatrixColumn(this.camera.matrix, 0),
      up = new V().setFromMatrixColumn(this.camera.matrix, 1);
    const shift = right
      .multiplyScalar(dx * perPixel)
      .add(up.multiplyScalar(-dy * perPixel));
    this.camera.position.add(shift);
    this.controls.target.add(shift);
    this.controls.update();
  }
  /* WebGL paints the canvas, so the CSS token block cannot reach it: without
     this the whole page would turn dark and the model would keep sitting on a
     bright rectangle. Only the backdrop and the ground grid are read from the
     tokens — the studio lights, the default STL grey and the mark colours stay
     fixed on purpose, so the same model looks the same in either theme. */
  applyTheme() {
    const token = (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const backdrop = new THREE.Color(token("--canvas-b") || "#e9ede8");
    this.scene.background = backdrop;
    this.scene.fog = new THREE.Fog(backdrop, 10, 35);
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    this.grid = new THREE.GridHelper(
      20,
      40,
      new THREE.Color(token("--canvas-grid-line") || "#c3cdc5"),
      new THREE.Color(token("--canvas-grid") || "#d7ddd8"),
    );
    this.grid.position.y = this.gridY;
    this.scene.add(this.grid);
  }
  setGridY(y) {
    this.gridY = y;
    if (this.grid) this.grid.position.y = y;
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  setMode(mode) {
    this.editEpoch = (this.editEpoch || 0) + 1;
    this.clickStart = null;
    this.controls.enabled = true;
    this.clearOverlay(this.previewOverlay);
    this.fillTarget = null;
    this.mode = mode;
    // Rotation no longer competes with the mode: it is on a button that marking
    // never uses, so the camera stays available while marking.
    this.controls.enableRotate = true;
    this.renderer.domElement.style.cursor =
      mode === "orbit" ? "grab" : "crosshair";
  }
  cameraState() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
    };
  }
  // Which way the top of the screen points in the world. `camera.up` is only
  // what lookAt was asked for; this is what the reviewer is actually shown.
  screenUp() {
    return new V(0, 1, 0).applyQuaternion(this.camera.quaternion).toArray();
  }
  // Every source triangle in the loaded model: the most a round could possibly
  // claim, and since `source-v2` the only ceiling on claiming that is honest.
  sourceFaceCount() {
    return this.meshes.reduce(
      (n, mesh) => n + (mesh.userData.fillTopology?.vertices.length || 0),
      0,
    );
  }
  /* Where a mark is and how much of the model it covers, in the model's own
     units, so that the agent can be told without being handed the geometry.

     It has to be computed here because this is the only place that can. The
     service keeps counts and a transform per mesh, not triangles, and under
     `source-v2` a mark whose faces were all taken whole carries no coordinate
     at all — the extent is a list of face numbers, and only the loaded model
     knows where those are. So the browser works it out once per save and sends
     it along, at about a hundred bytes for a mark of any size.

     `root` carries the preview fit — every model is scaled into a 3-unit box
     and centred — so scene coordinates are a rendering detail and mean nothing
     to anyone reading the batch. Until 1.3.0-dev these numbers were taken
     straight out of that space while a pin's `position` was already in the
     model's, and the two sat side by side in one array: a 160 mm assembly
     reported a stroke 2.85 across and 1.35 in area, which reads as millimetres
     and is out by 53 and by 2,845. Undoing `root` puts both in the same frame,
     and it is the only frame shared by marks that span several parts. */
  annotationBounds(a) {
    if (a.type !== "region") return null;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const total = [0, 0, 0];
    let area = 0;
    let count = 0;
    const cross = [0, 0, 0];
    /* Composed up the chain and stopped at `root`, rather than going out to
       world and dividing the fit back out. The fit is 3/maxDim, which is not
       exact in binary, so multiplying by it and undoing it leaves a residue --
       a corner at the origin came back as -2.8e-14, which then survives
       `toPrecision` and is read by whoever gets the batch. Stopping short of
       `root` never multiplies by it at all, and costs one matrix per mesh
       instead of two transforms per vertex. */
    const frames = new Map();
    const frameOf = (mesh) => {
      let m = frames.get(mesh);
      if (!m) {
        m = new THREE.Matrix4();
        for (let o = mesh; o && o !== this.root; o = o.parent)
          m.premultiply(o.matrix);
        frames.set(mesh, m);
      }
      return m;
    };
    const take = (mesh, vertices) => {
      const frame = frameOf(mesh);
      const world = vertices.map((p) =>
        new V().fromArray(p).applyMatrix4(frame).toArray(),
      );
      for (const p of world) {
        for (let i = 0; i < 3; i++) {
          lo[i] = Math.min(lo[i], p[i]);
          hi[i] = Math.max(hi[i], p[i]);
          total[i] += p[i];
        }
        count++;
      }
      // Newell's sum, which is the polygon's true area whether it is convex or
      // not; a fan from the first vertex would over-count a concave union.
      cross[0] = cross[1] = cross[2] = 0;
      for (let i = 0; i < world.length; i++) {
        const p = world[i];
        const q = world[(i + 1) % world.length];
        cross[0] += p[1] * q[2] - p[2] * q[1];
        cross[1] += p[2] * q[0] - p[0] * q[2];
        cross[2] += p[0] * q[1] - p[1] * q[0];
      }
      area += Math.hypot(...cross) / 2;
    };
    const whole = wholeFaces(a);
    for (const [meshId, faces] of Object.entries(a.faces || {})) {
      const mesh = this.meshMap.get(meshId);
      if (!mesh) continue;
      for (const face of faces) {
        if (!whole.has(`${meshId}:${face}`)) continue;
        const triangle = this.sourceTriangle(mesh, face);
        if (triangle) take(mesh, triangle);
      }
    }
    for (const patch of a.surfacePatches || []) {
      const mesh = this.meshMap.get(patch.meshId);
      if (mesh) take(mesh, patch.vertices);
    }
    if (!count) return null;
    const round = (v) => Number(v.toPrecision(6));
    return {
      // Named, because a batch saved before 1.3.0-dev carries the preview's
      // numbers under the same four keys and nothing else tells them apart.
      space: "model",
      centroid: total.map((v) => round(v / count)),
      min: lo.map(round),
      max: hi.map(round),
      area: round(area),
    };
  }
  restoreCamera(data) {
    if (!data) return;
    this.camera.position.fromArray(data.position);
    this.controls.target.fromArray(data.target);
    this.controls.update();
  }
  home() {
    // Flush residual OrbitControls damping before resetting; otherwise the
    // supposedly reset surface continues drifting under the next double click.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera.position.set(4, 2.8, 5);
    this.controls.target.set(0, 0, 0);
    // Nothing moves the up vector any more (see `viewFrom`); kept so that
    // nothing that ever does can outlive a trip home.
    this.camera.up.set(0, 1, 0);
    this.controls.update();
    this.controls.enableDamping = damping;
  }
  clearModel() {
    this.setNeutral(false);
    this.setAnnotations([]);
    this.clearOverlay(this.agentOverlay);
    this.clearOverlay(this.previewOverlay);
    this.fillTarget = null;
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    this.root.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m) materials.add(m);
    });
    for (const m of materials) {
      for (const value of Object.values(m))
        if (value?.isTexture) textures.add(value);
      m.dispose();
    }
    for (const t of textures) {
      t.dispose();
      t.source?.data?.close?.();
    }
    for (const g of geometries) {
      g.disposeBoundsTree?.();
      g.dispose();
    }
    for (const material of this.markMaterials.values()) material.dispose();
    this.markMaterials.clear();
    this.root.clear();
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.setGridY(GRID_Y);
    this.meshes = [];
    this.meshMap.clear();
    this.occlusionValid = false;
    this.renderer.renderLists.dispose();
  }
  async load(model, url, onStage = () => {}) {
    const epoch = ++this.loadingEpoch;
    this.enabled = false;
    this.clearModel();
    this.model = null;
    const response = await fetch(url);
    if (!response.ok) throw new Error(t("model.readFailed"));
    const data = await response.arrayBuffer();
    /* Checked against whichever file was actually fetched. For a STEP that is
       the derived mesh, not the source: `sha256` names what the author
       published and is what the round is discussed by, while `mesh.sha256`
       names the bytes on screen. Comparing the drawn bytes to the source hash
       would fail every time and tell the reviewer their version was stale. */
    const shown = model.mesh ?? model;
    const hash = await modelDigest(data);
    if (hash !== shown.sha256) {
      // Coded like the service's own refusal, because they mean the same thing
      // and the page has to stop retrying either of them.
      const mismatch = new Error(t("model.versionMismatch"));
      mismatch.code = "HASH_MISMATCH";
      throw mismatch;
    }
    if (epoch !== this.loadingEpoch) return;
    let object;
    if (shown.format === "glb") {
      const gltf = await new GLTFLoader().parseAsync(data, "");
      object = gltf.scene;
      if (declaresNoMaterials(data)) {
        const grey = reviewGrey();
        object.traverse((o) => {
          if (o.isMesh) o.material = grey;
        });
      }
    } else {
      const geometry = new STLLoader().parse(data);
      geometry.computeVertexNormals();
      object = new THREE.Mesh(geometry, reviewGrey());
      object.name = model.name;
    }
    if (epoch !== this.loadingEpoch) {
      object.traverse((o) => o.geometry?.dispose());
      return;
    }
    this.root.add(object);
    this.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.root),
      size = bounds.getSize(new V()),
      center = bounds.getCenter(new V());
    if (!Number.isFinite(size.length()) || size.length() === 0)
      throw new Error(t("model.noExtent"));
    const scale = 3 / Math.max(size.x, size.y, size.z);
    /* The turn goes on `root`, beside the fit, because every coordinate handed
       to the agent stops short of `root`: a pin is in its own mesh's frame, and
       a region's `space: "model"` numbers are composed up to `root` and no
       further. Turned anywhere below it, the model would stand up and every
       mark on it would come back rotated. */
    if (Z_UP_FORMATS.has(model.format)) this.root.rotation.x = -Math.PI / 2;
    this.root.scale.setScalar(scale);
    this.root.position
      .copy(center)
      .applyQuaternion(this.root.quaternion)
      .multiplyScalar(-scale);
    this.root.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(this.root);
    const floor = fitted.min.y;
    this.extent = fitted.getSize(new V()).toArray();
    this.setGridY(Math.min(GRID_Y, floor - 0.02));
    const source = [];
    this.root.traverse((o) => {
      if (o.isMesh) source.push(o);
    });
    const faces = source.map(
      (o) =>
        (o.geometry.index?.count || o.geometry.attributes.position.count) / 3,
    );
    for (const o of source)
      if (
        o.isSkinnedMesh ||
        o.isInstancedMesh ||
        o.geometry.morphAttributes.position?.length
      )
        throw new Error(t("model.animated"));
    const sourceTotal = faces.reduce((n, c) => n + c, 0);
    if (sourceTotal > MAX_REVIEW_TRIANGLES)
      throw new Error(t("model.tooManyTriangles"));
    // Share the budget by what each mesh needs, not by how many triangles it
    // happens to start with. A dense mesh used to hold a share far larger than
    // it could ever spend while a mesh of a few large faces was starved down to
    // raw triangles. Every mesh keeps at least its own faces; only the surplus
    // above that is rationed, so a model that fits is left exactly as before.
    const costs = source.map((o) => surfaceCost(o.geometry, o.matrixWorld));
    const extra = costs.map((c, i) =>
      Math.max(0, c.reduce((n, x) => n + x, 0) - faces[i]),
    );
    const demand = extra.reduce((n, x) => n + x, 0);
    const spare = MAX_REVIEW_TRIANGLES - sourceTotal;
    // Subdividing and building bounds trees is one synchronous block: whatever
    // is on screen when it starts stays frozen there until it ends, animations
    // included. Version tabs turn that from a one-time cost at open into a cost
    // per switch, so name it rather than leaving a stalled spinner. Two frames,
    // because one only schedules the paint and the second proves it happened.
    onStage(
      t("loading.rebuildingMesh", { count: sourceTotal.toLocaleString() }),
    );
    await nextPaint();
    if (epoch !== this.loadingEpoch) return;
    const originals = new Set();
    try {
      source.forEach((o, i) => {
        const budget =
          faces[i] +
          (demand <= spare
            ? extra[i]
            : Math.floor((spare * extra[i]) / demand));
        o.userData.fillTopology = buildFillTopology(o.geometry, o.matrixWorld);
        originals.add(o.geometry);
        o.geometry = reviewSurface(o.geometry, o.matrixWorld, budget, costs[i]);
        const meshId = `mesh-${this.meshes.length}`;
        o.userData.reviewId = meshId;
        // Keep review face indices aligned with sourceFaces. BVH's default
        // in-place triangle reordering would silently corrupt annotation mapping.
        o.geometry.computeBoundsTree({ targetLeafSize: 12, indirect: true });
        this.meshes.push(o);
        this.meshMap.set(meshId, o);
      });
    } finally {
      // A mesh converted before a later one failed must not keep its source
      // geometry alive; nothing calls clearModel on this path.
      for (const geometry of originals) geometry.dispose();
    }
    const total = this.meshes.reduce(
      (n, o) => n + o.geometry.attributes.position.count / 3,
      0,
    );
    // The rationing above is what keeps this true. Say so here anyway: without
    // it an over-budget manifest reaches the server, which can only answer with
    // the generic schema rejection and leaves the viewer with no explanation.
    if (total > MAX_REVIEW_TRIANGLES)
      throw new Error(t("model.meshOverBudget"));
    this.model = model;
    this.grid.position.y = floor - 0.025;
    this.home();
    const manifest = this.meshes.map((o) => ({
      id: o.userData.reviewId,
      name: o.name || o.userData.reviewId,
      triangles:
        (o.geometry.index?.count || o.geometry.attributes.position.count) / 3,
      sourceTriangles: o.geometry.userData.sourceTriangles,
      surfaceAlgorithm: SURFACE_ALGORITHM,
      matrixWorld: o.matrixWorld.toArray(),
    }));
    await this.onReady({ sha256: hash, meshes: manifest });
    if (epoch === this.loadingEpoch) this.enabled = true;
    return {
      triangles: total,
      meshes: this.meshes.length,
      // Running out of budget is silent by construction: the model loads, the
      // brush works, and only the large flat spans stop following a stroke. The
      // numbers that prove it exist right here and nowhere else afterwards.
      rationed: demand > spare,
      wanted: sourceTotal + demand,
      budget: MAX_REVIEW_TRIANGLES,
      sourceTriangles: sourceTotal,
    };
  }
  rayAt(x, y) {
    // Input can arrive before the next render after orbit/home changes.
    this.camera.updateMatrixWorld();
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((x - r.left) / r.width) * 2 - 1,
        (-(y - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    return this.ray.intersectObjects(this.meshes, false)[0] || null;
  }
  triangle(mesh, index) {
    const g = mesh.geometry,
      attr = g.attributes.position;
    const ids = g.index
      ? [
          g.index.getX(index * 3),
          g.index.getX(index * 3 + 1),
          g.index.getX(index * 3 + 2),
        ]
      : [index * 3, index * 3 + 1, index * 3 + 2];
    return new THREE.Triangle(
      ...ids.map((i) => new V().fromBufferAttribute(attr, i)),
    );
  }
  pinFromHit(hit) {
    const position = hit.object.worldToLocal(hit.point.clone());
    return {
      meshId: hit.object.userData.reviewId,
      faceIndex: hit.faceIndex,
      sourceFaceIndex: hit.object.geometry.userData.sourceFaces[hit.faceIndex],
      position: position.toArray(),
      normal: hit.face.normal.toArray(),
      barycentric: this.triangle(hit.object, hit.faceIndex)
        .getBarycoord(position, new V())
        .toArray(),
    };
  }
  // The triangle a source face number points at, in that mesh's local
  // coordinates — the space brush patches are stored in. `triangle()` reads the
  // review surface, whose indices only agree with source numbering by accident
  // of alignment; `source-v2` counts source faces, so it reads the topology
  // built from the geometry as it arrived.
  sourceTriangle(mesh, sourceFaceIndex) {
    return mesh.userData.fillTopology?.vertices[sourceFaceIndex] || null;
  }
  // Give every face a polygon, whatever the mark stores. A `source-v2` face
  // with no patch is the whole face, so it is materialised here rather than at
  // each of the places that wants geometry. Nothing materialised is written
  // back: this is the expanded reading of a mark, not the mark.
  expandWholeFaces(a, only) {
    const whole = wholeFaces(a);
    if (!whole.size) return a.surfacePatches || [];
    const extra = [];
    for (const key of whole) {
      if (only && !only.has(key)) continue;
      const [meshId, face] = [
        key.slice(0, key.lastIndexOf(":")),
        +key.slice(key.lastIndexOf(":") + 1),
      ];
      const mesh = this.meshMap.get(meshId);
      const vertices = mesh && this.sourceTriangle(mesh, face);
      if (vertices)
        extra.push({
          meshId,
          faceIndex: face,
          sourceFaceIndex: face,
          vertices: vertices.map((v) => [...v]),
        });
    }
    return [...(a.surfacePatches || []), ...extra];
  }
  /* The wire form of a mark, and the form it is stored in. `source-v2` goes out
     exactly as it is held: a whole face is its number, and materialising a
     polygon for it here would undo the entire point of the format one step
     before the mark leaves the page.

     It did exactly that for a release. The page held a fill in the compact
     form, counted its bytes in the compact form, and then sent the expanded
     one — 142 bytes a face on the wire, on disk, and in what the service reads
     back — while every number reported about the saving was read off the page.
     Expansion belongs to drawing, which is what `expandWholeFaces` is for. */
  serializeAnnotations(annotations) {
    return annotations.map((a) =>
      a.type === "pin" ||
      ["brush-v1", "source-v1", "source-v2"].includes(a.coverage)
        ? structuredClone(a)
        : {
            ...structuredClone(a),
            surfacePatches: Object.entries(a.faces).flatMap(
              ([meshId, faces]) => {
                const mesh = this.meshMap.get(meshId);
                return faces.map((faceIndex) => {
                  const t = this.triangle(mesh, faceIndex);
                  return {
                    meshId,
                    faceIndex,
                    sourceFaceIndex:
                      mesh.geometry.userData.sourceFaces[faceIndex],
                    vertices: [t.a.toArray(), t.b.toArray(), t.c.toArray()],
                  };
                });
              },
            ),
          },
    );
  }
  pointerDown(e) {
    this.gestureStart = [e.clientX, e.clientY];
    this.lastGestureDragged = false;
    if (
      e.button !== 0 ||
      this.mode === "orbit" ||
      !this.enabled ||
      this.editPending ||
      this.pinPending
    )
      return;
    // Option on the left button still declines to mark, which is the habit the
    // old scheme taught. Rotating no longer needs it — the right button does
    // that in every mode — so it is kept as a way to not mark, nothing more.
    if (e.altKey) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    /* Every remaining tool places its mark on a click, not on a drag, so the
       press only records where the click began; `click` asks `onEdit` for the
       draft and does the work. The drag branch left with the brush. */
    this.clickStart = [e.clientX, e.clientY];
  }
  pointerMove(e) {
    if (this.mode === "fill" && !e.buttons)
      this.previewFill(e.clientX, e.clientY);
    if (
      this.gestureStart &&
      Math.hypot(
        e.clientX - this.gestureStart[0],
        e.clientY - this.gestureStart[1],
      ) > 4
    )
      this.lastGestureDragged = true;
  }
  pointerUp() {
    this.gestureStart = null;
    if (this.editPending) return;
    this.controls.enabled = true;
  }
  setAnnotations(annotations, selectedId) {
    this.clearOverlay(this.overlay);
    this.labels.replaceChildren();
    this.pins = [];
    // Fresh pin records carry no cached occlusion; recheck on the next frame.
    this.occlusionValid = false;
    // Which pins existed before this pass, so the one just placed can be told
    // apart from the ones merely being redrawn.
    const seen = this.knownPins || new Set();
    const landing = this.placing;
    this.placing = false;
    for (const a of annotations) {
      if (a.type === "pin") {
        const mesh = this.meshMap.get(a.meshId);
        if (!mesh) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.className = `model-pin ${a.id === selectedId ? "selected" : ""}`;
        if (landing && !seen.has(a.id)) el.classList.add("landing");
        el.textContent = a.label;
        el.style.setProperty("--pin-color", a.color);
        el.setAttribute("aria-label", t("marks.one", { label: a.label }));
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onSelect?.(a.id);
        });
        this.labels.append(el);
        this.pins.push({ el, a, mesh });
      } else {
        for (const [meshId, faces] of Object.entries(a.faces)) {
          const mesh = this.meshMap.get(meshId);
          if (!mesh) continue;
          const coords = [];
          if (a.coverage === "source-v2") {
            // Both halves of one mark: the faces a stroke took whole are drawn
            // from their own triangles, the rest from the polygons stored for
            // them. A face appears in exactly one of the two.
            const partial = new Set();
            for (const patch of a.surfacePatches || [])
              if (patch.meshId === meshId) {
                partial.add(patch.faceIndex);
                fanInto(coords, patch.vertices);
              }
            for (const face of faces) {
              if (partial.has(face)) continue;
              const vertices = this.sourceTriangle(mesh, face);
              if (vertices) fanInto(coords, vertices);
            }
          } else if (["brush-v1", "source-v1"].includes(a.coverage)) {
            for (const patch of a.surfacePatches || []) {
              if (patch.meshId === meshId) fanInto(coords, patch.vertices);
            }
          } else
            for (const face of faces) {
              if (
                face >=
                (mesh.geometry.index?.count ||
                  mesh.geometry.attributes.position.count) /
                  3
              )
                continue;
              const t = this.triangle(mesh, face);
              for (const v of [t.a, t.b, t.c]) coords.push(...v.toArray());
            }
          if (!coords.length) continue;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(coords, 3),
          );
          const material = this.markMaterial(a.color, a.id === selectedId);
          const overlay = new THREE.Mesh(geometry, material);
          overlay.matrixAutoUpdate = false;
          overlay.matrix.copy(mesh.matrixWorld);
          overlay.renderOrder = 3;
          this.overlay.add(overlay);
        }
      }
    }
    this.knownPins = new Set(
      annotations.filter((a) => a.type === "pin").map((a) => a.id),
    );
  }
  /* Where the camera sits relative to what it is looking at, as the two angles
     a compass needs. Reported from the render loop but only when it actually
     changed, so a still scene costs nothing. */
  reportOrientation() {
    if (!this.onOrient) return;
    const d = this.scratch.orient
      .copy(this.camera.position)
      .sub(this.controls.target)
      .normalize();
    const yaw = Math.atan2(d.x, d.z) * (180 / Math.PI);
    const pitch = Math.asin(Math.min(1, Math.max(-1, d.y))) * (180 / Math.PI);
    if (
      this.orientAt &&
      Math.abs(this.orientAt.yaw - yaw) < 0.05 &&
      Math.abs(this.orientAt.pitch - pitch) < 0.05
    )
      return;
    this.orientAt = { yaw, pitch };
    this.onOrient(yaw, pitch);
  }
  /* A standard view changes only where the camera looks from. The target and
     the distance are kept, so picking a face reframes the model rather than
     resetting it — the reviewer keeps whatever they had zoomed in on. */
  viewFrom(x, y, z) {
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    const target = this.controls.target;
    const distance = Math.max(this.camera.position.distanceTo(target), 0.2);
    /* Straight down or straight up leaves the up vector parallel to the view,
       where it no longer says which way is up. This used to lay the up vector
       along the floor instead, and OrbitControls reads it once, when it is
       built: after a top or bottom view the orbit went on turning about +Y
       while lookAt used ±Z, and the right button turned the model some other
       way until a side face or home put it back. Standing a hair off the pole
       on the +Z side draws the same picture -- -Z at the top of the screen
       from above, +Z from below -- and the orbit never changes axis. */
    const vertical = Math.abs(y) > 0.9 && !x && !z;
    this.camera.position
      .set(x, y, vertical ? Math.abs(y) * Math.tan(POLE_OFFSET) : z)
      .normalize()
      .multiplyScalar(distance)
      .add(target);
    this.camera.lookAt(target);
    this.controls.update();
    this.controls.enableDamping = damping;
  }
  render() {
    this.controls.update();
    /* Seen from underneath, the ground is between the reviewer and the thing
       they went under there to look at, and every line of it lands on the
       surface being inspected. It is a floor: stand below it and it is not
       in the way, it is simply not there. */
    if (this.grid) this.grid.visible = this.camera.position.y > this.gridY;
    this.renderer.render(this.scene, this.camera);
    this.reportOrientation();
    if (!this.pins.length) return;
    const rect = this.container.getBoundingClientRect();
    // Occlusion costs one ray per pin and only changes when the view does. At
    // the documented 200-pin ceiling, testing it every frame was 12,000 BVH
    // raycasts a second; damping keeps this true for the frames that matter.
    const moved =
      !this.occlusionValid ||
      !this.occlusionAt.position.equals(this.camera.position) ||
      !this.occlusionAt.target.equals(this.controls.target);
    if (moved) {
      this.occlusionAt.position.copy(this.camera.position);
      this.occlusionAt.target.copy(this.controls.target);
      this.occlusionValid = true;
    }
    for (const pin of this.pins) {
      const world = pin.mesh.localToWorld(
        this.scratch.world.fromArray(pin.a.position),
      );
      const projected = this.scratch.projected.copy(world).project(this.camera);
      const inView =
        projected.z >= -1 &&
        projected.z <= 1 &&
        Math.abs(projected.x) < 1 &&
        Math.abs(projected.y) < 1;
      if (moved) {
        pin.unoccluded = false;
        if (inView) {
          this.ray.set(
            this.camera.position,
            this.scratch.direction
              .copy(world)
              .sub(this.camera.position)
              .normalize(),
          );
          const hit = this.ray.intersectObjects(this.meshes, false)[0];
          pin.unoccluded =
            !hit ||
            hit.distance >= this.camera.position.distanceTo(world) - 0.015;
        }
      }
      pin.el.hidden = !inView || !pin.unoccluded || !this.annotationsVisible;
      // The tail is what marks the spot, so the tail is what sits on it. The
      // label used to be centred above the point with a near-square corner
      // hinting at a direction it was not actually anchored in, which left the
      // exact surface a mark referred to unreadable.
      // Position belongs in `translate`, not `transform`: individual transform
      // properties compose translate → rotate → scale → transform, so a scale
      // written alongside a position in `transform` is applied to the position
      // as well, about the layer's own origin. The landing animation scales, so
      // putting the position after it is what keeps a mark on its point instead
      // of flying it in from the corner of the screen.
      pin.el.style.translate = `calc(${((projected.x + 1) * rect.width) / 2}px - 50%) calc(${((-projected.y + 1) * rect.height) / 2}px - 100% - 7px)`;
    }
  }
  /* Placing a mark is the one moment a reviewer makes something, and it used to
     happen in silence — the label simply existed on the next frame, which reads
     as the double click having been missed rather than taken. The ripple is
     drawn where the surface was actually struck, so it also says which point of
     the model was understood as the target. */
  ripple(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mark = document.createElement("div");
    mark.className = "pin-ripple";
    // Same reason as the label above: the ripple only scales, so its position
    // has to sit in `translate` or the scale carries it away from the point.
    mark.style.translate = `${clientX - rect.left}px ${clientY - rect.top}px`;
    mark.addEventListener("animationend", () => mark.remove());
    this.effects.append(mark);
  }
  focusAnnotation(a) {
    const mesh = this.meshMap.get(
      a.type === "pin" ? a.meshId : Object.keys(a.faces)[0],
    );
    if (!mesh) return;
    const first = Object.values(a.faces || {})[0]?.[0];
    const p =
      a.type === "pin"
        ? new V().fromArray(a.position)
        : a.coverage === "source-v2"
          ? // A region whose every face was taken whole stores no polygon to
            // aim at, so the face it does store answers instead.
            new V().fromArray(
              a.surfacePatches?.[0]?.vertices[0] ||
                this.sourceTriangle(mesh, first)?.[0] || [0, 0, 0],
            )
          : ["brush-v1", "source-v1"].includes(a.coverage)
            ? new V().fromArray(a.surfacePatches[0].vertices[0])
            : this.triangle(mesh, first).getMidpoint(new V());
    mesh.localToWorld(p);
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.camera.position.copy(p).add(offset);
    this.controls.target.copy(p);
    this.controls.update();
  }
  clearOverlay(group) {
    for (const o of [...group.children]) {
      // Geometry is per stroke; the material is shared and outlives the group.
      o.geometry.dispose();
      group.remove(o);
    }
  }
  // Overlay materials are rebuilt on every stroke. They depend only on these
  // three inputs, so share one instance per combination instead of compiling a
  // fresh onBeforeCompile closure for every patch group, every frame. Owned by
  // the viewer and released with the model, never by clearOverlay.
  markMaterial(color, selected = false, agent = false) {
    const key = `${color}|${selected}|${agent}`;
    const cached = this.markMaterials.get(key);
    if (cached) return cached;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.83,
      toneMapped: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float stripe = step(0.68, fract((gl_FragCoord.x ${agent ? "-" : "+"} gl_FragCoord.y) / 10.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${selected ? "0.05" : "0.98"}), stripe * 0.85);
      `,
      );
    };
    material.customProgramCacheKey = () => `marks-${selected}-${agent}`;
    this.markMaterials.set(key, material);
    return material;
  }
  setVisible(visible) {
    this.annotationsVisible = visible;
    this.overlay.visible = visible;
    this.agentOverlay.visible = visible && !this.agentHidden;
    this.previewOverlay.visible = visible;
  }
  setNeutral(neutral) {
    for (const mesh of this.meshes) {
      if (neutral && !mesh.userData.originalMaterial) {
        mesh.userData.originalMaterial = mesh.material;
        const copy = (m) => {
          const neutral = m.clone();
          neutral.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <color_fragment>",
              `#include <color_fragment>\ndiffuseColor.rgb=vec3(${PLAIN_DIFFUSE});`,
            );
          };
          neutral.customProgramCacheKey = () => "review-neutral";
          return neutral;
        };
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(copy)
          : copy(mesh.material);
      } else if (!neutral && mesh.userData.originalMaterial) {
        for (const m of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material])
          m.dispose();
        mesh.material = mesh.userData.originalMaterial;
        delete mesh.userData.originalMaterial;
      }
    }
    this.neutral = neutral;
  }
  drawPatches(group, patches, color, agent = false) {
    this.clearOverlay(group);
    const groups = new Map();
    for (const p of patches) {
      if (!groups.has(p.meshId)) groups.set(p.meshId, []);
      fanInto(groups.get(p.meshId), p.vertices);
    }
    for (const [id, coords] of groups) {
      const mesh = this.meshMap.get(id);
      if (!mesh) continue;
      const geometry = new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(coords, 3),
      );
      const overlay = new THREE.Mesh(
        geometry,
        this.markMaterial(color, true, agent),
      );
      overlay.matrixAutoUpdate = false;
      overlay.matrix.copy(mesh.matrixWorld);
      overlay.renderOrder = agent ? 5 : 4;
      group.add(overlay);
    }
  }
  setAgentEcho(echo) {
    this.agentEcho = echo;
    const annotations =
      echo?.versionId === this.model?.id ? echo.annotations : [];
    // Drawing, so this is the side that wants every face materialised — the
    // echo comes back in whatever form it was stored in.
    const patches = this.serializeAnnotations(annotations || []).flatMap((a) =>
      a.type === "pin" ? [] : this.expandWholeFaces(a),
    );
    this.drawPatches(this.agentOverlay, patches, "#f5dc72", true);
  }
  setFillTolerance(value) {
    this.fillTolerance = value;
    if (this.fillTarget) this.computeFill(this.fillTarget);
  }
  previewFill(x, y) {
    const hit = this.rayAt(x, y);
    if (!hit) {
      this.fillTarget = null;
      this.clearOverlay(this.previewOverlay);
      return;
    }
    const target = {
      mesh: hit.object,
      seed: hit.object.geometry.userData.sourceFaces[hit.faceIndex],
    };
    if (
      this.fillTarget?.mesh === target.mesh &&
      this.fillTarget?.seed === target.seed
    )
      return;
    this.computeFill(target);
  }
  computeFill(target) {
    this.fillTarget = target;
    const { mesh, seed } = target;
    const selected = new Set(
      planarFaces(mesh.userData.fillTopology, seed, this.fillTolerance),
    );
    // Every one of these is an entire source face by construction, so each is
    // stored as its number alone. The bucket is the cheapest tool there is.
    const patches = [...selected].map((sourceFaceIndex) => ({
      meshId: mesh.userData.reviewId,
      faceIndex: sourceFaceIndex,
      sourceFaceIndex,
      vertices: mesh.userData.fillTopology.vertices[sourceFaceIndex],
      whole: true,
    }));
    /* The bucket had a ceiling of its own — twenty thousand faces, the round's
       old face limit, which was the byte budget in disguise back when each of
       those faces would have stored a polygon repeating its own triangle.
       Every one of them is now its number alone, so a fill spanning a whole
       connected surface is a few kilobytes and there is nothing left here to
       protect. The budget is still checked, where the marks are stored. */
    this.fillPatches = patches;
    this.drawPatches(this.previewOverlay, this.fillPatches, "#fcfcfc");
  }
  async clickEdit(e) {
    const start = this.clickStart;
    this.clickStart = null;
    if (
      !start ||
      Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4 ||
      this.pinPending
    )
      return;
    const hit = this.rayAt(e.clientX, e.clientY);
    if (!hit) return;
    const epoch = this.editEpoch;
    const mode = this.mode,
      modelId = this.model?.id;
    /* Placing a label used to need a double click, so the habit arrives with
       the reviewer. Two single clicks in the same spot are that habit, not a
       request for two labels stacked on one another. */
    if (mode === "label") {
      const now = Date.now(),
        last = this.lastLabelAt;
      if (
        last &&
        now - last.time < 450 &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < 8
      )
        return;
      this.lastLabelAt = { time: now, x: e.clientX, y: e.clientY };
    }
    if (mode === "fill") this.previewFill(e.clientX, e.clientY);
    const patches = this.fillPatches,
      pin = this.pinFromHit(hit);
    this.pinPending = true;
    try {
      if (
        !(await this.onEdit()) ||
        modelId !== this.model?.id ||
        epoch !== this.editEpoch
      )
        return;
      if (mode === "relocate") this.onRelocate?.(pin);
      else if (mode === "fill" && patches?.length) this.onPaint(patches);
      else if (mode === "label") {
        this.ripple(e.clientX, e.clientY);
        // Consumed by the next render, so only the mark just placed lands.
        // Every pin element is rebuilt on each pass, and animating whichever
        // ones are new would make a page refresh look like a hailstorm.
        this.placing = true;
        this.onPin(pin);
      }
      this.onStrokeEnd();
    } catch (e) {
      this.onError(e.message);
    } finally {
      this.pinPending = false;
    }
  }
  stats() {
    return {
      versionId: this.model?.id,
      meshes: this.meshes.length,
      annotationsVisible: this.annotationsVisible,
      neutral: !!this.neutral,
      fillFaces: this.fillPatches?.length || 0,
      agentEchoId: this.agentEcho?.id || null,
      // The canvas takes its colour from the theme tokens by hand rather than
      // by rule, so whether it followed a theme change is only checkable here.
      background: this.scene.background?.getHexString() || null,
      // Same reason as the background: the ground is placed against the model
      // and hidden against the camera, both by hand, so where it ended up is
      // only answerable from in here.
      ground: this.grid
        ? { y: +this.gridY.toFixed(3), visible: this.grid.visible }
        : null,
      // Which way the model stands, as the fitted size along x, y (up) and z.
      extent: this.extent?.map((v) => +v.toFixed(3)) ?? null,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
}
