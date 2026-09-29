import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  cloneModelDeep,
  decimateMesh,
  generateLOD,
  countTriangles,
} from "../src/generator.js";

function sampleModel() {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x888888 }),
  );
  mesh.name = "sample";
  mesh.position.set(1, 2, 3);
  group.add(mesh);
  return group;
}

function firstMesh(object) {
  let hit = null;
  object.traverse((child) => {
    if (child.isMesh && !hit) hit = child;
  });
  return hit;
}

test("cloneModelDeep edits its own geometry without touching the source", () => {
  const source = sampleModel();
  const original = countTriangles(source);
  const clone = cloneModelDeep(source);

  decimateMesh(firstMesh(clone), 0.5);

  assert.ok(countTriangles(clone) < original);
  assert.equal(countTriangles(source), original);
  const mesh = firstMesh(clone);
  assert.equal(mesh.name, "sample");
  assert.equal(mesh.position.x, 1);
  assert.equal(mesh.position.y, 2);
  assert.equal(mesh.position.z, 3);
  assert.equal(mesh.material.color.getHexString(), "888888");
});

test("generateLOD keeps the original as level 0 and owns each level", () => {
  const source = sampleModel();
  const original = countTriangles(source);
  const lods = generateLOD(source, 4);

  assert.equal(lods.length, 4);
  assert.equal(lods[0].triangles, original);
  const tris = lods.map((lod) => lod.triangles);
  assert.ok(tris[0] >= tris[1]);
  assert.ok(tris[1] >= tris[2]);
  assert.ok(tris[2] >= tris[3]);
  assert.ok(tris[3] < tris[0]);

  const beforeLast = countTriangles(lods[3].mesh);
  decimateMesh(firstMesh(lods[1].mesh), 0.5);
  assert.equal(countTriangles(lods[3].mesh), beforeLast);
  assert.equal(countTriangles(source), original);
});
