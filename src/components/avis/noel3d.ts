import * as THREE from "three";

import { enFetes } from "./saison";

/**
 * Le décor de fêtes ajouté aux scènes 3D : une neige en relief qui tombe sans
 * s'arrêter devant et derrière le sujet, et des boules de Noël suspendues en
 * haut de l'écran qui se balancent doucement. Tout est accroché à la caméra :
 * le décor reste à l'écran quels que soient les mouvements de la scène.
 * Hors saison, rien n'est ajouté.
 */
export function decorerNoel(scene: THREE.Scene, camera: THREE.PerspectiveCamera, o: { mobile: boolean; reduit: boolean }) {
  if (!enFetes()) return { animer: () => {}, liberer: () => {} };
  if (!camera.parent) scene.add(camera);
  const groupe = new THREE.Group();
  camera.add(groupe);
  const jetables: Array<{ dispose(): void }> = [];

  // Flocon : un petit disque flou dessiné une fois.
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.45, "rgba(255,255,255,0.85)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(c);
  jetables.push(texture);

  // Trois couches de profondeur : loin (petits, lents), milieu, près (gros, flous).
  const couches = [
    { n: o.mobile ? 70 : 160, z: [-26, -16], taille: 0.12, vitesse: 0.55 },
    { n: o.mobile ? 50 : 110, z: [-15, -8], taille: 0.1, vitesse: 0.8 },
    { n: o.mobile ? 18 : 40, z: [-7, -3.5], taille: 0.07, vitesse: 1.1 },
  ].map((k) => {
    const pos = new Float32Array(k.n * 3);
    const phase = new Float32Array(k.n);
    for (let i = 0; i < k.n; i++) {
      pos[i * 3] = Math.random() * 2 - 1; // en fraction de la largeur visible
      pos[i * 3 + 1] = Math.random() * 2 - 1;
      pos[i * 3 + 2] = k.z[0] + Math.random() * (k.z[1] - k.z[0]);
      phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    const vrai = new Float32Array(k.n * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(vrai, 3));
    const mat = new THREE.PointsMaterial({ map: texture, size: k.taille * (o.mobile ? 1.2 : 1), transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 10;
    groupe.add(pts);
    jetables.push(geo, mat);
    return { ...k, pos, phase, geo };
  });

  // Les boules suspendues : rouge, or, vert sapin (deux sur téléphone).
  // Placées aux bords extrêmes de l'écran, petites, pour ne jamais couvrir le texte.
  const teintes = o.mobile ? [0xc8102e] : [0xc8102e, 0xd4a017, 0x1f7a4d];
  const boules = teintes.map((teinte, i) => {
    const pivot = new THREE.Group();
    const fil = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 6), new THREE.MeshBasicMaterial({ color: 0xd9d2c3 }));
    const boule = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshPhysicalMaterial({ color: teinte, metalness: 0.55, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }));
    const attache = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.36, 16), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 }));
    pivot.add(fil, boule, attache);
    groupe.add(pivot);
    jetables.push(fil.geometry, fil.material as THREE.Material, boule.geometry, boule.material as THREE.Material, attache.geometry, attache.material as THREE.Material);
    return { pivot, fil, boule, attache, longueur: [0.16, 0.26, 0.1][i] ?? 0.16, phase: i * 1.7 };
  });

  const PROF_BOULES = -9;
  // Les boules pendent sous l'en-tête du site (s'il reste collé en haut), pas derrière.
  let sousEntete = 0, compteur = 0;
  const mesurerEntete = () => {
    const e = document.querySelector("header");
    if (!e) return 0;
    const pos = getComputedStyle(e).position;
    const b = e.getBoundingClientRect();
    return (pos === "sticky" || pos === "fixed") && b.top <= 1 ? Math.max(0, b.bottom) : 0;
  };
  let avant = performance.now();

  return {
    animer() {
      const maintenant = performance.now();
      const dt = Math.min(0.05, (maintenant - avant) / 1000);
      avant = maintenant;
      const t = maintenant / 1000;
      const demiH = (d: number) => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * -d;
      for (const k of couches) {
        const arr = k.geo.attributes.position.array as Float32Array;
        for (let i = 0; i < k.pos.length / 3; i++) {
          if (!o.reduit) {
            k.pos[i * 3 + 1] -= dt * k.vitesse * 0.12;
            k.pos[i * 3] += Math.sin(t * 0.6 + k.phase[i]) * dt * 0.02;
            if (k.pos[i * 3 + 1] < -1.05) {
              k.pos[i * 3 + 1] = 1.05;
              k.pos[i * 3] = Math.random() * 2 - 1;
            }
          }
          const z = k.pos[i * 3 + 2];
          const h = demiH(z);
          const v = camera.view;
          const ox = v?.enabled ? (2 * h * camera.aspect * (v.offsetX + (v.width - v.fullWidth) / 2)) / v.fullWidth : 0;
          const oy = v?.enabled ? (-2 * h * (v.offsetY + (v.height - v.fullHeight) / 2)) / v.fullHeight : 0;
          arr[i * 3] = ox + k.pos[i * 3] * h * camera.aspect;
          arr[i * 3 + 1] = oy + k.pos[i * 3 + 1] * h;
          arr[i * 3 + 2] = z;
        }
        k.geo.attributes.position.needsUpdate = true;
      }
      const h = demiH(PROF_BOULES);
      const w = h * camera.aspect;
      // Certaines scènes décalent leur cadrage (setViewOffset) : on recentre le décor sur ce qui est vraiment à l'écran.
      const v = camera.view;
      const cx = v?.enabled ? (2 * w * (v.offsetX + (v.width - v.fullWidth) / 2)) / v.fullWidth : 0;
      const cy = v?.enabled ? (-2 * h * (v.offsetY + (v.height - v.fullHeight) / 2)) / v.fullHeight : 0;
      if (compteur++ % 30 === 0) sousEntete = mesurerEntete();
      const haut = cy + h - (2 * h * sousEntete) / Math.max(1, window.innerHeight);
      // Rayon et longueur du fil en fraction de la demi-hauteur visible : même taille à l'écran partout.
      const rayon = h * (o.mobile ? 0.045 : 0.055);
      const xs = o.mobile ? [0.9] : [-0.965, 0.965, 0.865];
      boules.forEach((b, i) => {
        const L = b.longueur * h;
        b.pivot.position.set(cx + xs[i] * w, haut + 0.01, PROF_BOULES);
        b.pivot.rotation.z = o.reduit ? 0 : Math.sin(t * 0.9 + b.phase) * 0.1;
        b.fil.scale.y = L;
        b.fil.position.y = -L / 2;
        b.attache.scale.setScalar(rayon);
        b.attache.position.y = -L - rayon * 0.1;
        b.boule.scale.setScalar(rayon);
        b.boule.position.y = -L - rayon * 1.12;
        b.boule.rotation.y = t * 0.4;
      });
    },
    liberer() {
      camera.remove(groupe);
      jetables.forEach((j) => j.dispose());
    },
  };
}
