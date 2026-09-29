import * as THREE from "three";

/* A small studio for the generated asset: turntable orbit, the same PBR look
   as the review viewer, and an animation mixer so a clip can be watched before
   it is exported. Kept separate from the review viewer on purpose - the review
   surface is for marking models, not for animating the thing being built. */
export class AssetPreview {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    this.camera.position.set(2.6, 1.8, 3.4);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "generated asset preview",
    );
    container.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8d9ba8, 2.21));
    const key = new THREE.DirectionalLight(0xfff4dc, 1.39);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd3e3ff, 0.84);
    fill.position.set(-5, 3, -4);
    this.scene.add(fill);
    this.model = new THREE.Group();
    this.scene.add(this.model);
    this.mixer = null;
    this.clips = [];
    this.playing = true;
    this.autoRotate = true;
    this.time = 0;
    this.applyTheme();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  applyTheme() {
    const token = (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    this.scene.background = new THREE.Color(token("--canvas-b") || "#e9ede8");
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setModel(model) {
    this.clearModel();
    if (!model) {
      this.clips = [];
      return;
    }
    this.model.add(model);
    this.clips = Array.isArray(model.animations) ? model.animations : [];
    if (this.clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      const wanted = this.clipName || this.clips[0].name;
      const clip = this.clips.find((c) => c.name === wanted) || this.clips[0];
      this.clipName = clip.name;
      this.action = this.mixer.clipAction(clip);
      this.action.play();
    }
    this.fit();
  }

  clearModel() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
      this.action = null;
    }
    for (const child of [...this.model.children]) {
      this.model.remove(child);
    }
  }

  setClip(name) {
    if (!this.mixer || !this.clips.length) return;
    const clip = this.clips.find((c) => c.name === name);
    if (!clip) return;
    this.clipName = clip.name;
    this.action = this.mixer.clipAction(clip);
    this.action.reset();
    this.action.play();
    if (!this.playing) this.action.paused = true;
  }

  setPlaying(playing) {
    this.playing = playing;
    if (this.action) this.action.paused = !playing;
  }

  setAutoRotate(on) {
    this.autoRotate = on;
  }

  fit() {
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-4);
    this.camera.position
      .set(2.6, 1.8, 3.4)
      .sub(center)
      .multiplyScalar(2.2 / maxDim);
    this.camera.lookAt(center);
    this.model.position.copy(center).multiplyScalar(-1);
  }

  frame() {
    const dt = Math.min((performance.now() - (this._last || 0)) / 1000, 0.05);
    this._last = performance.now();
    if (this.playing && this.mixer) this.mixer.update(dt);
    if (this.autoRotate) {
      this.model.rotation.y += dt * 0.45;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.clearModel();
    this.renderer.dispose();
  }
}
